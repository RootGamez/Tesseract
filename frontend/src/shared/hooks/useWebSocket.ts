import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useSceneStore } from '@/features/student/store/sceneStore';
import { useChatStore } from '@/features/chat/store/chatStore';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CHANNELS = ['sessions', 'chat', 'board', 'presentations', 'gamification'] as const;
type ChannelType = typeof CHANNELS[number];

// ── Token helpers (Branch 'main') ─────────────────────────────────────────────

/** Returns the number of seconds until the JWT expires (negative if already expired). */
function jwtSecondsUntilExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1; // treat unparseable tokens as expired
  }
}

/**
 * Returns a valid access token.
 * If the stored token is about to expire (< 30 s), attempts a silent refresh.
 * Returns null if no token is available or refresh fails (caller should redirect to login).
 */
async function getValidToken(): Promise<string | null> {
  const access = localStorage.getItem('tesseract_access_token');
  const refresh = localStorage.getItem('tesseract_refresh_token');

  if (!access) return null;

  // Token still has more than 30 seconds left — use it as-is
  if (jwtSecondsUntilExpiry(access) > 30) return access;

  // Token expired or about to — try refresh
  if (!refresh) {
    console.warn('[WS] Access token expired and no refresh token found.');
    return null;
  }

  try {
    const { data } = await axios.post(
      `${API_URL}/api/v1/auth/token/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' } }
    );
    localStorage.setItem('tesseract_access_token', data.access);
    if (data.refresh) localStorage.setItem('tesseract_refresh_token', data.refresh);
    console.log('[WS] Access token silently refreshed.');
    return data.access;
  } catch {
    console.warn('[WS] Token refresh failed — clearing session.');
    localStorage.removeItem('tesseract_access_token');
    localStorage.removeItem('tesseract_refresh_token');
    return null;
  }
}

// ── Close codes that mean "auth rejected — stop retrying" ─────────────────────
const AUTH_CLOSE_CODES = new Set([4001, 4003]);

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWebSocket(sessionId: string | null, role: 'student' | 'instructor' = 'student') {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const sockets = useRef<{ [key in ChannelType]: WebSocket | null }>({
    sessions: null,
    chat: null,
    board: null,
    presentations: null,
    gamification: null,
  });
  const reconnectAttempts = useRef(0);
  const timeoutIds = useRef<number[]>([]);

  // Keep mutable values in refs so stable callbacks always see the latest
  const sessionIdRef = useRef(sessionId);
  const roleRef = useRef(role);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { roleRef.current = role; }, [role]);

  // ── Zustand action selectors ────────────────────────────────────────────────
  const setSceneState         = useSceneStore((s) => s.setSceneState);
  const addChatMessage      = useChatStore((s) => s.addMessage);
  const deleteChatMessage   = useChatStore((s) => s.deleteMessage);
  const setChatMessages     = useChatStore((s) => s.setMessages);
  const triggerPointAnimation = useSceneStore((s) => s.triggerPointAnimation);
  const triggerSpinner      = useSceneStore((s) => s.triggerSpinner);
  const triggerTimer        = useSceneStore((s) => s.triggerTimer);
  const syncOrchestrator    = useOrchestratorStore((s) => s.syncState);

  const actionsRef = useRef({
    setSceneState, addChatMessage, deleteChatMessage, setChatMessages,
    triggerPointAnimation, triggerSpinner, triggerTimer, syncOrchestrator,
  });
  
  useEffect(() => {
    actionsRef.current = {
      setSceneState, addChatMessage, deleteChatMessage, setChatMessages,
      triggerPointAnimation, triggerSpinner, triggerTimer, syncOrchestrator,
    };
  }, [
    setSceneState, addChatMessage, deleteChatMessage, setChatMessages,
    triggerPointAnimation, triggerSpinner, triggerTimer, syncOrchestrator,
  ]);

  // ── Message dispatcher ─────────────────────────────────────────────────────
  const handleWsMessage = (channel: ChannelType, data: any) => {
    const { event, payload } = data;
    console.log(`[WS Event] [${channel}]`, event, payload);
    const a = actionsRef.current;

    const upsertStage = (stageId: string, stageType: string, stageTitle?: string) => {
      const store = useOrchestratorStore.getState();
      const exists = store.stages.some((stage) => stage.id === stageId);
      if (exists) return;

      const nextStages = [
        ...store.stages,
        {
          id: stageId,
          title: stageTitle || stageType,
          type: stageType,
          duration: 10,
          completed: false,
        },
      ];

      a.syncOrchestrator({ stages: nextStages });
    };

    switch (event) {
      case 'SESSION_STATE':
        if (payload.current_stage) {
          a.setSceneState({
            activeScene: payload.current_stage.stage_type,
            stageData: payload.current_stage.config,
          });
          useOrchestratorStore.getState().setActiveStage(payload.current_stage.id);
        }
        if (payload.stages) {
          const mappedStages = payload.stages.map((s: any) => ({
            id: s.id, title: s.title, type: s.stage_type,
            duration: s.duration_estimated_minutes, completed: false,
          }));
          a.syncOrchestrator({
            stages: mappedStages,
            sessionInfo: {
              title: payload.title,
              duration: payload.duration_seconds
                ? Math.round(payload.duration_seconds / 60)
                : 60,
            },
          });
        }
        break;

      case 'STAGE_CHANGED':
        a.setSceneState({ activeScene: payload.type, stageData: payload.data });
        upsertStage(payload.stage_id, payload.type, payload.data?.title);
        useOrchestratorStore.getState().setActiveStage(payload.stage_id);
        break;

      case 'PARTICIPANT_JOINED':
        {
          const state = useOrchestratorStore.getState();
          const exists = state.participants.some(p => p.id === payload.participant_id);
          let newParticipants = [...state.participants];
          if (exists) {
            newParticipants = newParticipants.map(p =>
              p.id === payload.participant_id ? { ...p, online: true } : p
            );
          } else {
            newParticipants.push({
              id: payload.participant_id,
              name: payload.display_name,
              points: 0,
              online: true,
            });
          }
          state.syncState({ participants: newParticipants });
        }
        break;

      case 'PARTICIPANT_LEFT':
        {
          const state = useOrchestratorStore.getState();
          const newParticipants = state.participants.map(p =>
            p.id === payload.participant_id ? { ...p, online: false } : p
          );
          state.syncState({ participants: newParticipants });
        }
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

      // ── Presentations events (Branch 'pdf') ─────────────────────────────────
      case 'PRESENTATION_STATE':
        window.dispatchEvent(new CustomEvent('presentation-state', { detail: payload }));
        break;
      case 'slide.change':
        window.dispatchEvent(new CustomEvent('presentation-slide-change', { detail: payload }));
        break;
      case 'canvas.draw':
        window.dispatchEvent(new CustomEvent('presentation-canvas-draw', { detail: payload }));
        break;

      // ── Chat events ─────────────────────────────────────────────────────────
      case 'CHAT_MESSAGE':
        a.addChatMessage(payload);
        break;
      case 'CHAT_HISTORY':
        if (payload?.messages) a.setChatMessages(payload.messages);
        break;
      case 'CHAT_MESSAGE_DELETED':
        a.deleteChatMessage(payload.message_id);
        break;
      case 'CHAT_USER_SILENCED':
        break;

      // ── Gamification events ─────────────────────────────────────────────────
      case 'EMOJI_FIRED':
        a.addChatMessage({
          id: `${payload.student_id}-${payload.timestamp}`,
          author_id: payload.student_id,
          author: payload.display_name,
          text: payload.emoji,
          timestamp: payload.timestamp,
          float: true,
        });
        break;
      case 'POINTS_AWARDED':
        a.triggerPointAnimation(payload.points, payload.total);
        if (roleRef.current === 'instructor') {
          useOrchestratorStore.getState().updateParticipantPoints(
            payload.participant_id, payload.total
          );
        }
        break;
      case 'SPINNER_RESULT':
        a.triggerSpinner(payload);
        break;
      case 'TIMER_STARTED':
        a.triggerTimer(payload);
        break;
      case 'TIMER_PAUSED':
      case 'TIMER_CANCELLED':
        break;
      case 'QUIZ_LAUNCHED':
        a.setSceneState({ activeScene: 'QUIZ', stageData: payload });
        window.dispatchEvent(new CustomEvent('quiz-launched', { detail: payload }));
        break;
      case 'QUIZ_RESULTS':
        window.dispatchEvent(new CustomEvent('quiz-results', { detail: payload }));
        break;
      case 'PDF_PAGE_CHANGED':
        window.dispatchEvent(new CustomEvent('pdf-page-changed', { detail: payload }));
        break;
      default:
        break;
    }
  };

  // ── Reconnect ──────────────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});

  const attemptReconnect = useCallback((authFailed = false) => {
    if (authFailed) {
      console.error('[WS] Auth rejected by server (code 4001/4003). Redirecting to login.');
      setIsConnected(false);
      setIsReconnecting(false);
      window.location.href = '/login';
      return;
    }

    const MAX_ATTEMPTS = 5;
    const MAX_INTERVAL = 30_000;

    setIsReconnecting(true);

    if (reconnectAttempts.current >= MAX_ATTEMPTS) {
      console.warn('[WS] Max reconnect attempts reached. Will retry in 30 s.');
      const id = window.setTimeout(() => connectRef.current(), MAX_INTERVAL);
      timeoutIds.current.push(id);
      return;
    }

    const delay = Math.min(Math.pow(2, reconnectAttempts.current) * 1000, MAX_INTERVAL);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
    const id = window.setTimeout(() => {
      reconnectAttempts.current += 1;
      connectRef.current();
    }, delay);
    timeoutIds.current.push(id);
  }, []);

  // ── Core connect ───────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const sId = sessionIdRef.current;
    if (!sId || sId === 'undefined' || sId === 'null') return;

    const token = await getValidToken();
    if (!token) {
      console.error('[WS] No valid token available. Redirecting to login.');
      window.location.href = '/login';
      return;
    }

    CHANNELS.forEach((channel) => {
      const existing = sockets.current[channel];

      if (existing?.readyState === WebSocket.CONNECTING) return;

      if (existing && existing.readyState !== WebSocket.CLOSED) {
        existing.onclose = null;
        existing.close(1000, 'Reconnecting');
      }

      const url = `${WS_URL}/${channel}/${sId}/?token=${token}`;
      const ws = new WebSocket(url);
      sockets.current[channel] = ws;

      ws.onopen = () => {
        if (channel === 'sessions') {
          setIsConnected(true);
          setIsReconnecting(false);
          reconnectAttempts.current = 0;
          ws.send(JSON.stringify({ event: 'REQUEST_FULL_SYNC' }));
        }
      };

      ws.onmessage = ({ data }) => {
        try {
          handleWsMessage(channel, JSON.parse(data));
        } catch (err) {
          console.error(`[WS] [${channel}] Parse error`, err);
        }
      };

      ws.onclose = (event) => {
        sockets.current[channel] = null;
        if (channel === 'sessions') {
          setIsConnected(false);
          const isAuthError = AUTH_CLOSE_CODES.has(event.code);
          if (event.code !== 1000 && event.code !== 1001) {
            attemptReconnect(isAuthError);
          }
        }
      };

      ws.onerror = () => {
        console.error(`[WS] [${channel}] Connection error`);
      };
    });
  }, [attemptReconnect]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  // ── Mount / sessionId change ───────────────────────────────────────────────
  useEffect(() => {
    void connect();
    return () => {
      timeoutIds.current.forEach(clearTimeout);
      CHANNELS.forEach((channel) => {
        const ws = sockets.current[channel];
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          ws.onclose = null;
          ws.close(1000, 'Component unmounted');
        }
      });
    };
  }, [connect]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback((channel: ChannelType, event: string, payload: any) => {
    const ws = sockets.current[channel];
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, payload }));
    } else {
      console.warn(`[WS] Channel "${channel}" is not open.`);
    }
  }, []);

  return { isConnected, isReconnecting, sendMessage };
}