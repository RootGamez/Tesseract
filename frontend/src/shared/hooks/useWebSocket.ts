import { useEffect, useRef, useState, useCallback } from 'react';
import { useSceneStore } from '@/features/student/store/sceneStore';
import { useChatStore } from '@/features/chat/store/chatStore';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

export const WS_URL = 'ws://localhost:8000/ws';

export function useWebSocket(sessionId: string | null, role: 'student' | 'instructor' = 'student') {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectInterval = 30000;

  const setSceneState = useSceneStore((state) => state.setSceneState);
  const addChatMessage = useChatStore((state) => state.addMessage);
  const triggerPointAnimation = useSceneStore((state) => state.triggerPointAnimation);
  const triggerSpinner = useSceneStore((state) => state.triggerSpinner);
  const triggerTimer = useSceneStore((state) => state.triggerTimer);
  const syncOrchestrator = useOrchestratorStore((state) => state.syncState);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= 5) {
      setTimeout(connect, maxReconnectInterval);
      return;
    }
    
    setIsReconnecting(true);
    const timeout = Math.pow(2, reconnectAttempts.current) * 1000;
    setTimeout(() => {
      reconnectAttempts.current += 1;
      connect();
    }, Math.min(timeout, maxReconnectInterval));
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;
    
    const url = `${WS_URL}/${role === 'instructor' ? 'sessions' : 'sessions'}/${sessionId}/`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttempts.current = 0;
      ws.current?.send(JSON.stringify({ event: 'REQUEST_FULL_SYNC' }));
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsEvent(data);
      } catch (err) {
        console.error('WS Parse Error', err);
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      attemptReconnect();
    };

    ws.current.onerror = (err) => {
      console.error('WS Error', err);
      ws.current?.close();
    };
  }, [sessionId, role, attemptReconnect]);

  const handleWsEvent = (data: any) => {
    const { event, payload } = data;
    switch (event) {
      case 'SESSION_STATE':
        setSceneState(payload);
        if (role === 'instructor') syncOrchestrator(payload);
        break;
      case 'STAGE_CHANGED':
        setSceneState({ activeScene: payload.type, stageData: payload.data });
        break;
      case 'CHAT_MESSAGE':
        addChatMessage(payload);
        break;
      case 'POINTS_AWARDED':
        triggerPointAnimation(payload.points, payload.total);
        if (role === 'instructor') {
            useOrchestratorStore.getState().updateParticipantPoints(payload.participant_id, payload.total);
        }
        break;
      case 'SPINNER_RESULT':
        triggerSpinner(payload);
        break;
      case 'TIMER_STARTED':
        triggerTimer(payload);
        break;
      default:
        console.log('Unhandled WS Event:', event, payload);
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((event: string, payload: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event, payload }));
    }
  }, []);

  return { isConnected, isReconnecting, sendMessage };
}
