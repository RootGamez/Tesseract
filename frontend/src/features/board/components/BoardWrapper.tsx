import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Excalidraw, reconcileElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import throttle from 'lodash.throttle';
import { useSceneStore } from '@/features/student/store/sceneStore';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

interface BoardWrapperProps {
  role: 'student' | 'instructor';
  sendMessage: (channel: 'sessions' | 'chat' | 'board' | 'gamification', event: string, payload: any) => void;
}

// Allow parent to call flushSnapshot() before changing stage
export interface BoardWrapperHandle {
  flushSnapshot: () => Promise<void>;
}

const BoardWrapper = forwardRef<BoardWrapperHandle, BoardWrapperProps>(
  ({ role, sendMessage }, ref) => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
    const excalidrawAPIRef = useRef<any>(null);

    // Track whether we've received the first SCENE_INIT for this mount.
    // We don't broadcast our own edits until we know the base scene.
    const isInitialized = useRef(false);

    // Última versión que hemos emitido o recibido por elemento (id → version).
    // Sustituye al "lock global": evita re-emitir lo que ya sincronizamos
    // y resuelve conflictos por versión (modelo nativo de Excalidraw).
    const syncedVersions = useRef<Map<string, number>>(new Map());
    // IDs de archivos (imágenes) ya enviados, para no re-subirlos en cada delta.
    const sentFileIds = useRef<Set<string>>(new Set());

    const containerRef = useRef<HTMLDivElement>(null);
    const canDraw = useSceneStore((state) => state.canDraw);
    const activeStageId = useOrchestratorStore((state) => state.activeStageId);

    // Stable ref so closures always read the latest activeStageId
    const activeStageIdRef = useRef(activeStageId);
    useEffect(() => {
      activeStageIdRef.current = activeStageId;
    }, [activeStageId]);

    // Peer laser pointers
    const [peerPointers, setPeerPointers] = useState<{
      [userId: string]: { x: number; y: number; name: string; timestamp: number };
    }>({});

    // Track last received remote update (for fallback re-sync)
    const lastRemoteUpdateAt = useRef(0);

    // ── Helpers de versionado ──────────────────────────────────────────────────

    /** Devuelve los elementos cuya versión es más nueva que la última sincronizada. */
    const collectSyncable = (elements: readonly any[]): any[] => {
      const out: any[] = [];
      for (const el of elements) {
        const known = syncedVersions.current.get(el.id);
        if (known === undefined || el.version > known) {
          out.push(el);
        }
      }
      return out;
    };

    /** Marca elementos como sincronizados (no se re-emitirán). */
    const markSynced = (elements: readonly any[]) => {
      for (const el of elements) {
        const known = syncedVersions.current.get(el.id);
        if (known === undefined || el.version > known) {
          syncedVersions.current.set(el.id, el.version);
        }
      }
    };

    /** Extrae solo los files referenciados por estos elementos y aún no enviados. */
    const collectNewFiles = (elements: readonly any[], allFiles: any): any => {
      if (!allFiles) return {};
      const result: any = {};
      for (const el of elements) {
        const fid = el.fileId;
        if (fid && allFiles[fid] && !sentFileIds.current.has(fid)) {
          result[fid] = allFiles[fid];
          sentFileIds.current.add(fid);
        }
      }
      return result;
    };

    // ── Envío de deltas (throttle 100ms — RF-BOARD-01) ──────────────────────────
    const throttledSend = useRef(
      throttle((elements: any[], appState: any, stageId: string, files: any) => {
        sendMessage('board', 'SCENE_UPDATE', { elements, appState, stage_id: stageId, files });
      }, 100)
    ).current;

    // 30ms throttle for laser pointer movements (RF-BOARD-03)
    const throttledLaserSend = useRef(
      throttle((x: number, y: number) => {
        sendMessage('board', 'LASER_MOVE', { x, y, active: true });
      }, 30)
    ).current;

    const isMounted = useRef(true);
    useEffect(() => {
      return () => {
        isMounted.current = false;
        throttledSend.cancel();
        throttledLaserSend.cancel();
      };
    }, [throttledSend, throttledLaserSend]);

    // Keep excalidrawAPIRef in sync
    useEffect(() => {
      excalidrawAPIRef.current = excalidrawAPI;
    }, [excalidrawAPI]);

    // Expose flushSnapshot to parent: envía toda la escena antes de cambiar de etapa
    useImperativeHandle(ref, () => ({
      flushSnapshot: () => {
        return new Promise<void>((resolve) => {
          const api = excalidrawAPIRef.current;
          const stageId = activeStageIdRef.current;
          if (!api || !stageId) {
            resolve();
            return;
          }
          throttledSend.cancel();
          const elements = api.getSceneElementsIncludingDeleted();
          const appState = api.getAppState();
          const files = api.getFiles();
          markSynced(elements);
          sendMessage('board', 'SCENE_UPDATE', {
            elements: Array.from(elements),
            appState,
            stage_id: stageId,
            files,
          });
          // Dar 200ms al WebSocket para entregar antes de cambiar de escena
          setTimeout(resolve, 200);
        });
      },
    }));

    // onChange: llamado por Excalidraw en cada edición local
    const onChange = (elements: readonly any[], appState: any, files: any) => {
      if (!isMounted.current) return;
      if (role === 'student' && !canDraw) return;
      if (!isInitialized.current) return;

      // Solo emitir los elementos que cambiaron (delta), no toda la escena
      const syncable = collectSyncable(elements);
      if (syncable.length === 0) return;

      markSynced(syncable);
      const newFiles = collectNewFiles(syncable, files);
      throttledSend(syncable, appState, activeStageIdRef.current!, newFiles);
    };

    const onPointerUpdate = (payload: any) => {
      if (!isMounted.current) return;
      if (payload.pointer) {
        throttledLaserSend(payload.pointer.x, payload.pointer.y);
      }
    };

    // Pedir sync completo (SCENE_INIT) cuando el API y la escena están listos
    useEffect(() => {
      if (!excalidrawAPI || !activeStageId) return;
      console.log(`[BoardWrapper] Requesting SCENE_INIT for stage ${activeStageId}`);
      isInitialized.current = false;
      syncedVersions.current.clear();
      sentFileIds.current.clear();
      sendMessage('board', 'REQUEST_BOARD_SYNC', { stage_id: activeStageId });
    }, [excalidrawAPI, activeStageId]);

    // Aplicar actualizaciones remotas (SCENE_INIT / SCENE_UPDATE) vía reconcile
    useEffect(() => {
      const handleRemoteUpdate = (e: Event) => {
        const data = (e as CustomEvent<any>).detail;
        const api = excalidrawAPIRef.current;
        if (!api || !data) return;

        // Ignorar updates de otras escenas
        if (data.stage_id && data.stage_id !== activeStageIdRef.current) {
          return;
        }

        const isInit = data.event === 'SCENE_INIT' || data.is_full_sync;
        const remoteElements = data.elements || [];
        lastRemoteUpdateAt.current = Date.now();

        // Cargar imágenes en la caché de Excalidraw
        if (data.files && Object.keys(data.files).length > 0) {
          try {
            api.addFiles(Object.values(data.files));
            for (const fid of Object.keys(data.files)) sentFileIds.current.add(fid);
          } catch (err) {
            console.error('[BoardWrapper] addFiles error:', err);
          }
        }

        // Reconciliar por versión (sin lock global): elige la versión más alta por elemento
        const localElements = api.getSceneElementsIncludingDeleted();
        const reconciled = reconcileElements(localElements, remoteElements as any, api.getAppState());

        // Marcar lo recibido como sincronizado para no re-emitirlo en onChange
        markSynced(reconciled);

        api.updateScene({ elements: reconciled });

        if (isInit) {
          isInitialized.current = true;
          console.log(`[BoardWrapper] Stage ${activeStageIdRef.current} initialized ✓ (${reconciled.length} elements)`);
        }
      };

      const handleLaserMove = (e: Event) => {
        const data = (e as CustomEvent).detail;
        setPeerPointers((prev) => ({
          ...prev,
          [data.user_id]: {
            x: data.x,
            y: data.y,
            name: data.display_name,
            timestamp: Date.now(),
          },
        }));
      };

      window.addEventListener('board-update', handleRemoteUpdate);
      window.addEventListener('laser-move', handleLaserMove);

      return () => {
        window.removeEventListener('board-update', handleRemoteUpdate);
        window.removeEventListener('laser-move', handleLaserMove);
      };
    }, [excalidrawAPI]);

    // Red de seguridad: si un estudiante no recibe nada en 5s, re-pide SCENE_INIT.
    // Con reconcile es idempotente (no parpadea, deduplica por versión).
    useEffect(() => {
      if (role !== 'student') return;
      const interval = setInterval(() => {
        const stageId = activeStageIdRef.current;
        const api = excalidrawAPIRef.current;
        if (!stageId || !api) return;
        if (Date.now() - lastRemoteUpdateAt.current > 5000) {
          sendMessage('board', 'REQUEST_BOARD_SYNC', { stage_id: stageId });
        }
      }, 5000);
      return () => clearInterval(interval);
    }, [role, sendMessage]);

    // Cleanup stale laser cursors
    useEffect(() => {
      const interval = setInterval(() => {
        const now = Date.now();
        setPeerPointers((prev) => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach((key) => {
            if (now - next[key].timestamp > 3000) {
              delete next[key];
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }, 1000);
      return () => clearInterval(interval);
    }, []);

    const isViewMode = role === 'student' && !canDraw;

    return (
      <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#121214]">
        {/* Laser cursors overlay */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {Object.entries(peerPointers).map(([userId, p]) => (
            <div
              key={userId}
              className="absolute transition-all duration-75 ease-out"
              style={{ left: `${p.x}px`, top: `${p.y}px`, transform: 'translate(-50%, -50%)' }}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center animate-pulse shadow-glow border border-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
              <div className="ml-4 -mt-2 bg-card/90 backdrop-blur text-[10px] text-white px-2 py-0.5 rounded border border-border/40 font-medium">
                {p.name}
              </div>
            </div>
          ))}
        </div>

        <Excalidraw
          excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          viewModeEnabled={isViewMode}
          theme="light"
          gridModeEnabled={false}
          initialData={{ appState: { viewBackgroundColor: "#ffffff" } }}
        />
      </div>
    );
  }
);

BoardWrapper.displayName = 'BoardWrapper';
export default BoardWrapper;
