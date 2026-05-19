import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
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

    // isRemoteUpdate: while true, onChange is silenced
    const isRemoteUpdate = useRef(false);
    // Track whether we've received the first full_sync for this mount
    const isInitialized = useRef(false);

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

    // 100ms throttle for board element changes (RF-BOARD-01)
    const throttledSend = useRef(
      throttle((elements: any[], appState: any, stageId: string, files: any) => {
        sendMessage('board', 'BOARD_UPDATE', { elements, appState, stage_id: stageId, files });
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

    // Expose flushSnapshot to parent: sends current state immediately and waits
    useImperativeHandle(ref, () => ({
      flushSnapshot: () => {
        return new Promise<void>((resolve) => {
          const api = excalidrawAPIRef.current;
          const stageId = activeStageIdRef.current;
          if (!api || !stageId) {
            resolve();
            return;
          }
          throttledSend.cancel(); // cancel any pending debounced call
          const elements = api.getSceneElements();
          const appState = api.getAppState();
          const files = api.getFiles();
          sendMessage('board', 'BOARD_UPDATE', {
            elements: Array.from(elements),
            appState,
            stage_id: stageId,
            files,
          });
          // Give the WebSocket 200ms to deliver to the server before we switch stage
          setTimeout(resolve, 200);
        });
      },
    }));

    // onChange: called by Excalidraw on every user edit
    const onChange = (elements: readonly any[], appState: any, files: any) => {
      if (!isMounted.current) return;
      if (role === 'student' && !canDraw) return;
      if (isRemoteUpdate.current) return;
      if (!isInitialized.current) return;

      throttledSend(Array.from(elements), appState, activeStageIdRef.current!, files);
    };

    const onPointerUpdate = (payload: any) => {
      if (!isMounted.current) return;
      if (payload.pointer) {
        throttledLaserSend(payload.pointer.x, payload.pointer.y);
      }
    };

    // Request full board sync when API is ready
    useEffect(() => {
      if (!excalidrawAPI || !activeStageId) return;
      console.log(`[BoardWrapper] Requesting BOARD_SYNC for stage ${activeStageId}`);
      isInitialized.current = false;
      sendMessage('board', 'REQUEST_BOARD_SYNC', { stage_id: activeStageId });
    }, [excalidrawAPI, activeStageId]);

    // Listen to remote board updates
    useEffect(() => {
      const handleRemoteUpdate = (e: Event) => {
        // detail IS the payload: { elements, appState, files, is_full_sync, stage_id? }
        const data = (e as CustomEvent<any>).detail;
        const api = excalidrawAPIRef.current;

        if (!api || !data) return;

        // Ignore updates for other stages
        if (data.stage_id && data.stage_id !== activeStageIdRef.current) {
          console.log(`[BoardWrapper] Skipping update for stage ${data.stage_id} (active: ${activeStageIdRef.current})`);
          return;
        }

        const elements = data.elements || [];
        console.log(`[BoardWrapper] Applying remote update — ${elements.length} elements, is_full_sync: ${data.is_full_sync}`);

        isRemoteUpdate.current = true;

        // Load image files into Excalidraw cache
        if (data.files && Object.keys(data.files).length > 0) {
          try {
            api.addFiles(Object.values(data.files));
          } catch (err) {
            console.error('[BoardWrapper] addFiles error:', err);
          }
        }

        api.updateScene({ elements });

        // Release lock after two animation frames (Excalidraw needs them to process)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isRemoteUpdate.current = false;
            if (data.is_full_sync) {
              isInitialized.current = true;
              console.log(`[BoardWrapper] Stage ${activeStageIdRef.current} initialized ✓`);
            }
          });
        });
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
          theme="dark"
          gridModeEnabled={true}
        />
      </div>
    );
  }
);

BoardWrapper.displayName = 'BoardWrapper';
export default BoardWrapper;
