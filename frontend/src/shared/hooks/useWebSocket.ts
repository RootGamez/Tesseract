import { useEffect, useRef, useState, useCallback } from 'react';
import { useSceneStore } from '@/features/student/store/sceneStore';
import { useChatStore } from '@/features/chat/store/chatStore';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

const CHANNELS = ['sessions', 'chat', 'board', 'gamification'] as const;
type ChannelType = typeof CHANNELS[number];

export function useWebSocket(sessionId: string | null, role: 'student' | 'instructor' = 'student') {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const sockets = useRef<{ [key in ChannelType]: WebSocket | null }>({
    sessions: null,
    chat: null,
    board: null,
    gamification: null,
  });
  const reconnectAttempts = useRef(0);
  const maxReconnectInterval = 30000;
  const timeoutIds = useRef<number[]>([]);

  const setSceneState = useSceneStore((state) => state.setSceneState);
  const addChatMessage = useChatStore((state) => state.addMessage);
  const deleteChatMessage = useChatStore((state) => state.deleteMessage);
  const setChatMessages = useChatStore((state) => state.setMessages);
  const triggerPointAnimation = useSceneStore((state) => state.triggerPointAnimation);
  const triggerSpinner = useSceneStore((state) => state.triggerSpinner);
  const triggerTimer = useSceneStore((state) => state.triggerTimer);
  const syncOrchestrator = useOrchestratorStore((state) => state.syncState);

  const handleWsEvent = useCallback((channel: ChannelType, data: any) => {
    const { event, payload } = data;
    console.log(`[WS Event] [${channel}]`, event, payload);

    switch (event) {
      case 'SESSION_STATE':
        if (payload.current_stage) {
          setSceneState({
            activeScene: payload.current_stage.stage_type,
            stageData: payload.current_stage.config,
          });
          useOrchestratorStore.getState().setActiveStage(payload.current_stage.id);
        }
        break;
      case 'STAGE_CHANGED':
        setSceneState({ activeScene: payload.type, stageData: payload.data });
        useOrchestratorStore.getState().setActiveStage(payload.stage_id);
        break;
      case 'PARTICIPANT_JOINED':
      case 'PARTICIPANT_LEFT':
        // Refetch participants list from REST API to keep in sync
        break;

      case 'BOARD_UPDATE':
        window.dispatchEvent(new CustomEvent('board-update', { detail: payload }));
        break;
      case 'LASER_MOVE':
        window.dispatchEvent(new CustomEvent('laser-move', { detail: payload }));
        break;
      case 'BOARD_PERMISSION_GRANTED':
        useSceneStore.getState().setCanDraw(true);
        break;
      case 'BOARD_PERMISSION_REVOKED':
        useSceneStore.getState().setCanDraw(false);
        break;

      // ── Chat events ──────────────────────
      case 'CHAT_MESSAGE':
        addChatMessage(payload);
        break;
      case 'CHAT_HISTORY':
        if (payload && payload.messages) {
          setChatMessages(payload.messages);
        }
        break;
      case 'CHAT_MESSAGE_DELETED':
        deleteChatMessage(payload.message_id);
        break;
      case 'CHAT_USER_SILENCED':
        // Check if the silenced user is me or check participant ID
        break;

      // ── Gamification events ──────────────
      case 'EMOJI_FIRED':
        addChatMessage({
          id: `${payload.student_id}-${payload.timestamp}`,
          author_id: payload.student_id,
          author: payload.display_name,
          text: payload.emoji,
          timestamp: payload.timestamp,
          float: true,
        });
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
      case 'TIMER_PAUSED':
      case 'TIMER_CANCELLED':
        // Clear timer on pause/cancel
        break;
      default:
        break;
    }
  }, [setSceneState, addChatMessage, deleteChatMessage, setChatMessages, triggerPointAnimation, triggerSpinner, triggerTimer, syncOrchestrator, role]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= 5) {
      const id = window.setTimeout(connect, maxReconnectInterval);
      timeoutIds.current.push(id);
      return;
    }
    
    setIsReconnecting(true);
    const timeout = Math.pow(2, reconnectAttempts.current) * 1000;
    const id = window.setTimeout(() => {
      reconnectAttempts.current += 1;
      connect();
    }, Math.min(timeout, maxReconnectInterval));
    timeoutIds.current.push(id);
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') return;
    
    const token = localStorage.getItem('tesseract_access_token');
    if (!token) {
      console.warn('No JWT access token found, WebSocket connection deferred');
      return;
    }

    CHANNELS.forEach((channel) => {
      // If there is already a socket open or connecting, close it first
      if (sockets.current[channel]) {
        sockets.current[channel]?.close();
      }

      const url = `${WS_URL}/${channel}/${sessionId}/?token=${token}`;
      const ws = new WebSocket(url);
      sockets.current[channel] = ws;

      ws.onopen = () => {
        if (channel === 'sessions') {
          setIsConnected(true);
          setIsReconnecting(false);
          reconnectAttempts.current = 0;
        }
        // Send initial resync requests
        if (channel === 'sessions') {
          ws.send(JSON.stringify({ event: 'REQUEST_FULL_SYNC' }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsEvent(channel, data);
        } catch (err) {
          console.error(`[WS Error] [${channel}] Parse Error`, err);
        }
      };

      ws.onclose = (event) => {
        if (channel === 'sessions') {
          setIsConnected(false);
          // If not closed cleanly, attempt reconnect
          if (event.code !== 1000 && event.code !== 1001) {
            attemptReconnect();
          }
        }
        sockets.current[channel] = null;
      };

      ws.onerror = (err) => {
        console.error(`[WS Error] [${channel}] Error`, err);
        ws.close();
      };
    });

  }, [sessionId, attemptReconnect, handleWsEvent]);

  useEffect(() => {
    connect();
    return () => {
      timeoutIds.current.forEach(clearTimeout);
      CHANNELS.forEach((channel) => {
        if (sockets.current[channel]) {
          sockets.current[channel]?.close();
        }
      });
    };
  }, [connect]);

  const sendMessage = useCallback((channel: ChannelType, event: string, payload: any) => {
    const ws = sockets.current[channel];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, payload }));
    } else {
      console.warn(`WebSocket for channel "${channel}" is not open.`);
    }
  }, []);

  return { isConnected, isReconnecting, sendMessage };
}
