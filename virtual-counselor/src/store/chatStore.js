import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useChatStore = create(
  persist(
    (set) => ({
      // UI State
      isOpen: false,
      hasUnread: false,
      
      // Chat Data State
      messages: [],

      // Actions
      toggleChat: () => set((state) => ({ 
        isOpen: !state.isOpen, 
        hasUnread: false // clear unread dot when opened
      })),

      addMessage: (message) => set((state) => ({ 
        messages: [...state.messages, message],
        hasUnread: !state.isOpen // show red dot if message arrives while closed
      })),

      clearHistory: () => set({ messages: [] }),
    }),
    {
      name: 'vc-chat-storage', // The unique key used in localStorage
    }
  )
);