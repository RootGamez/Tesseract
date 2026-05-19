import { useState, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import throttle from 'lodash.throttle';
import { useSceneStore } from '@/features/student/store/sceneStore';

interface BoardWrapperProps {
  role: 'student' | 'instructor';
  sendMessage: (channel: 'sessions' | 'chat' | 'board' | 'gamification', event: string, payload: any) => void;
}

export default function BoardWrapper({ role, sendMessage }: BoardWrapperProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const isUpdatingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canDraw = useSceneStore((state) => state.canDraw);

  // Peer laser pointers
  const [peerPointers, setPeerPointers] = useState<{
    [userId: string]: { x: number; y: number; name: string; timestamp: number };
  }>({});

  // 100ms throttle for board element changes (RF-BOARD-01)
  const throttledSend = useRef(
    throttle((elements: any[], appState: any) => {
      sendMessage('board', 'BOARD_UPDATE', { elements, appState });
    }, 100)
  ).current;

  // 30ms throttle for laser pointer movements (RF-BOARD-03)
  const throttledLaserSend = useRef(
    throttle((x: number, y: number) => {
      sendMessage('board', 'LASER_MOVE', { x, y, active: true });
    }, 30)
  ).current;

  const onChange = (elements: readonly any[], appState: any) => {
    if (role === 'student' && !canDraw) return;
    if (isUpdatingRef.current) return;

    // Send update
    throttledSend(Array.from(elements), appState);
  };

  const onPointerUpdate = (payload: any) => {
    if (payload.pointer) {
      throttledLaserSend(payload.pointer.x, payload.pointer.y);
    }
  };

  // Listen to remote board updates and laser moves
  useEffect(() => {
    const handleRemoteUpdate = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!excalidrawAPI) return;

      isUpdatingRef.current = true;
      excalidrawAPI.updateScene({
        elements: data.elements || [],
      });
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 50);
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

  // Cleanup old peer laser pointers after 3 seconds of inactivity
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

  // Determine if student is locked out of drawing
  const isViewMode = role === 'student' && !canDraw;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#121214]">
      {/* Laser cursors overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {Object.entries(peerPointers).map(([userId, p]) => (
          <div
            key={userId}
            className="absolute transition-all duration-75 ease-out"
            style={{
              left: `${p.x}px`,
              top: `${p.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
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
