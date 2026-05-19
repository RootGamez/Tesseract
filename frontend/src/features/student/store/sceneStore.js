import { create } from 'zustand';

export const useSceneStore = create((set) => ({
  activeScene: 'BOARD', // BOARD, PDF, VIDEO, QUIZ, GAME, BREAK
  stageData: null,
  points: 0,
  pointAnimation: null, // { amount, total, id }
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
