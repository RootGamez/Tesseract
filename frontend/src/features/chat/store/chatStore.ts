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
  isSilenced: boolean;

  setDrawerOpen: (isOpen: boolean) => void;
  setIsSilenced: (silenced: boolean) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  deleteMessage: (messageId: string) => void;
  removeBubble: (bubbleId: number) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  floatingBubbles: [],
  isDrawerOpen: false,
  isSilenced: false,

  setDrawerOpen: (isOpen) => set({ isDrawerOpen: isOpen }),
  setIsSilenced: (silenced) => set({ isSilenced: silenced }),
  setMessages: (messages) => set({ messages }),

  addMessage: (msg) => set((state) => {
    const newMessages = [...state.messages, msg];
    
    let newBubbles = state.floatingBubbles;
    if (!state.isDrawerOpen && msg.float !== false) {
      const bubble = { ...msg, bubbleId: Date.now() + Math.random() };
      newBubbles = [...state.floatingBubbles, bubble].slice(-3);
    }

    return { messages: newMessages, floatingBubbles: newBubbles };
  }),

  deleteMessage: (messageId) => set((state) => ({
    messages: state.messages.filter((m) => m.id !== messageId),
    floatingBubbles: state.floatingBubbles.filter((m) => m.id !== messageId),
  })),

  removeBubble: (bubbleId) => set((state) => ({
    floatingBubbles: state.floatingBubbles.filter(b => b.bubbleId !== bubbleId)
  })),
}));
