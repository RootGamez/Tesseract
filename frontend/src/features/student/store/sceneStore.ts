import { create } from 'zustand';

export type SceneType = 'BOARD' | 'PDF' | 'PRESENTATION' | 'VIDEO' | 'QUIZ' | 'GAME' | 'SUBMISSION' | 'BREAK';

export interface SceneState {
  activeScene: SceneType;
  stageData: any | null;
  points: number;
  pointAnimation: { amount: number; total: number; id: number } | null;
  spinnerData: any | null;
  timerData: {
    timerId: string;
    label: string;
    endTimestampUtc: string | null;
    durationSeconds: number;
    isPaused: boolean;
    remainingSeconds: number;
  } | null;
  canDraw: boolean;
  rouletteState: {
    isOpen: boolean;
    participants: { id: string; name: string }[];
    // Token único por giro: el alumno gira cuando cambia (idempotente).
    // null = ruleta abierta pero aún sin girar.
    spinId: number | null;
    winnerId: string | null;
    winnerName: string | null;
  } | null;

  setSceneState: (payload: Partial<SceneState>) => void;
  setCanDraw: (canDraw: boolean) => void;
  triggerPointAnimation: (amount: number, total: number) => void;
  clearPointAnimation: () => void;
  triggerSpinner: (payload: any) => void;
  clearSpinner: () => void;
  triggerTimer: (payload: any) => void;
  clearTimer: () => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  activeScene: 'BOARD',
  stageData: null,
  points: 0,
  pointAnimation: null,
  spinnerData: null,
  timerData: null,
  canDraw: false,
  rouletteState: null,

  setSceneState: (payload) => set((state) => ({ ...state, ...payload })),
  setCanDraw: (canDraw) => set({ canDraw }),
  
  triggerPointAnimation: (amount, total) => set({
    pointAnimation: { amount, total, id: Date.now() },
    points: total
  }),
  
  clearPointAnimation: () => set({ pointAnimation: null }),

  triggerSpinner: (payload) => set({ spinnerData: payload }),
  clearSpinner: () => set({ spinnerData: null }),

  triggerTimer: (payload) => set({ timerData: payload }),
  clearTimer: () => set({ timerData: null }),
}));
