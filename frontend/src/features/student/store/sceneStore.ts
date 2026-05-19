import { create } from 'zustand';

export type SceneType = 'BOARD' | 'PDF' | 'VIDEO' | 'QUIZ' | 'GAME' | 'BREAK';

export interface SceneState {
  activeScene: SceneType;
  stageData: any | null;
  points: number;
  pointAnimation: { amount: number; total: number; id: number } | null;
  spinnerData: any | null;
  timerData: any | null;

  setSceneState: (payload: Partial<SceneState>) => void;
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

  setSceneState: (payload) => set((state) => ({ ...state, ...payload })),
  
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
