import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  author_id: string;
  author: string;
  text: string;
  timestamp: string;
  float?: boolean;
}

export interface FloatingBubble extends ChatMessage {
  bubbleId: number;
}

export interface ChatState {
  messages: ChatMessage[];
  floatingBubbles: FloatingBubble[];
  isDrawerOpen: boolean;

  setDrawerOpen: (isOpen: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  removeBubble: (bubbleId: number) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  floatingBubbles: [],
  isDrawerOpen: false,

  setDrawerOpen: (isOpen) => set({ isDrawerOpen: isOpen }),

  addMessage: (msg) => set((state) => {
    const newMessages = [...state.messages, msg];
    
    let newBubbles = state.floatingBubbles;
    if (!state.isDrawerOpen && msg.float !== false) {
      const bubble = { ...msg, bubbleId: Date.now() + Math.random() };
      newBubbles = [...state.floatingBubbles, bubble].slice(-3);
    }

    return { messages: newMessages, floatingBubbles: newBubbles };
  }),

  removeBubble: (bubbleId) => set((state) => ({
    floatingBubbles: state.floatingBubbles.filter(b => b.bubbleId !== bubbleId)
  })),
}));
