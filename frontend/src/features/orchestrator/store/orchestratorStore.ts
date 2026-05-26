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
  sessionInfo: { title: string; duration: number; join_code?: string };
  stages: Stage[];
  activeStageId: string;
  participants: Participant[];
  
  syncState: (payload: Partial<OrchestratorState>) => void;
  updateParticipantPoints: (participantId: string, totalPoints: number) => void;
  setActiveStage: (stageId: string) => void;
}

export const useOrchestratorStore = create<OrchestratorState>((set) => ({
  sessionInfo: { title: 'Tesseract Live Class', duration: 60, join_code: '' },
  stages: [],
  activeStageId: '',
  participants: [],
  
  syncState: (payload) => set((state) => ({ ...state, ...payload })),
  
  updateParticipantPoints: (participantId, totalPoints) => set((state) => ({
    participants: state.participants.map(p => 
      p.id === participantId ? { ...p, points: totalPoints } : p
    ).sort((a, b) => b.points - a.points)
  })),

  setActiveStage: (stageId) => set({ activeStageId: stageId }),
}));
