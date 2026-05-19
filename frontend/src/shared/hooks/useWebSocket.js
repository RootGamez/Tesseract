import { useEffect, useRef, useState, useCallback } from 'react';
import { useSceneStore } from '@/features/student/store/sceneStore';
import { useChatStore } from '@/features/chat/store/chatStore';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

export const WS_URL = 'ws://localhost:8000/ws'; // Adjust for production

export function useWebSocket(sessionId, role = 'student') {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const ws = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectInterval = 30000;

  // Actions from stores
  const setSceneState = useSceneStore((state) => state.setSceneState);
  const addChatMessage = useChatStore((state) => state.addMessage);
  const triggerPointAnimation = useSceneStore((state) => state.triggerPointAnimation);
  const triggerSpinner = useSceneStore((state) => state.triggerSpinner);
  const triggerTimer = useSceneStore((state) => state.triggerTimer);
  const syncOrchestrator = useOrchestratorStore((state) => state.syncState);

  const connect = useCallback(() => {
    if (!sessionId) return;
    
    // In a real app we'd pass JWT via token or session cookie
    const url = `${WS_URL}/${role === 'instructor' ? 'sessions' : 'sessions'}/${sessionId}/`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttempts.current = 0;
      console.log('WS Connected');
      // If reconnecting, ask for full sync (RNF-INFRA-04)
      ws.current.send(JSON.stringify({ event: 'REQUEST_FULL_SYNC' }));
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
      ws.current.close();
    };
  }, [sessionId, role]);

  const handleWsEvent = (data) => {
    const { event, payload } = data;
    switch (event) {
      case 'SESSION_STATE':
        // Full sync
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
        // payload: { student_id, name, points, total }
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

  const attemptReconnect = () => {
    if (reconnectAttempts.current >= 5) {
      // Reached max initial retries, keep trying every 30s
      setTimeout(connect, maxReconnectInterval);
      return;
    }
    
    setIsReconnecting(true);
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const timeout = Math.pow(2, reconnectAttempts.current) * 1000;
    setTimeout(() => {
      reconnectAttempts.current += 1;
      connect();
    }, Math.min(timeout, maxReconnectInterval));
  };

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((event, payload) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event, payload }));
    }
  }, []);

  return { isConnected, isReconnecting, sendMessage };
}
