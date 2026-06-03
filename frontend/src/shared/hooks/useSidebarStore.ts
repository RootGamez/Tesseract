import { create } from 'zustand';

interface SidebarState {
  /** Whether the main navigation sidebar overlay is open. */
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  // The sidebar is tucked away by default and opens as an overlay on demand.
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setOpen: (isOpen) => set({ isOpen }),
}));
