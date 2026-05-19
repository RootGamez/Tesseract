import { create } from 'zustand';

export interface Stage {
  id: string;
  title: string;
  type: string;
  duration: number;
  completed: boolean;
}

export interface Participant {
  id: string;
  name: string;
  points: number;
  online: boolean;
}

export interface OrchestratorState {
  sessionInfo: { title: string; duration: number };
  stages: Stage[];
  activeStageId: string;
  participants: Participant[];
  
  syncState: (payload: Partial<OrchestratorState>) => void;
  updateParticipantPoints: (participantId: string, totalPoints: number) => void;
  setActiveStage: (stageId: string) => void;
}

export const useOrchestratorStore = create<OrchestratorState>((set) => ({
  sessionInfo: { title: 'Tesseract Live Class', duration: 60 },
  stages: [
    { id: '1', title: 'Intro y Pizarra', type: 'BOARD', duration: 10, completed: true },
    { id: '2', title: 'Conceptos Clave', type: 'PDF', duration: 15, completed: false },
    { id: '3', title: 'Quiz 1', type: 'QUIZ', duration: 5, completed: false },
  ],
  activeStageId: '2',
  participants: [
    { id: 'p1', name: 'Ana García', points: 45, online: true },
    { id: 'p2', name: 'Luis Pérez', points: 20, online: true },
    { id: 'p3', name: 'María Gómez', points: 60, online: false },
  ],
  
  syncState: (payload) => set((state) => ({ ...state, ...payload })),
  
  updateParticipantPoints: (participantId, totalPoints) => set((state) => ({
    participants: state.participants.map(p => 
      p.id === participantId ? { ...p, points: totalPoints } : p
    ).sort((a, b) => b.points - a.points)
  })),

  setActiveStage: (stageId) => set({ activeStageId: stageId }),
}));
