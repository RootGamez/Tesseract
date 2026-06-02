import { create } from 'zustand';

interface StudentDashboardState {
  isJoinModalOpen: boolean;
  isLoadingSessions: boolean;
  openJoinModal: () => void;
  closeJoinModal: () => void;
  setLoadingSessions: (loading: boolean) => void;
}

export const useStudentDashboardStore = create<StudentDashboardState>((set) => ({
  isJoinModalOpen: false,
  isLoadingSessions: false,
  openJoinModal: () => set({ isJoinModalOpen: true }),
  closeJoinModal: () => set({ isJoinModalOpen: false }),
  setLoadingSessions: (loading: boolean) => set({ isLoadingSessions: loading }),
}));
