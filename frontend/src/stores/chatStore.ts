import { create } from 'zustand';
import { apiClient, type ChatMessage, type ChatHistoryItem } from '@/lib/api';

interface ChatState {
  messages: ChatMessage[];
  history: ChatHistoryItem[];
  isLoading: boolean;
  error: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  loadHistory: (groupId: number) => Promise<void>;
  sendMessage: (
    content: string,
    groupId?: number,
    shareToken?: string
  ) => Promise<ChatMessage | null>;
  setFeedback: (
    chatLogId: number,
    feedback: 'good' | 'bad' | null,
    shareToken?: string
  ) => Promise<boolean>;
  reset: () => void;
}

const initialState = {
  messages: [],
  history: [],
  isLoading: false,
  error: null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) => {
    const { messages } = get();
    set({ messages: [...messages, message] });
  },

  clearMessages: () => set({ messages: [] }),

  loadHistory: async (groupId: number) => {
    set({ isLoading: true, error: null });
    try {
      const history = await apiClient.getChatHistory(groupId);
      set({ history, isLoading: false, error: null });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load chat history';
      set({ isLoading: false, error: errorMessage });
    }
  },

  sendMessage: async (
    content: string,
    groupId?: number,
    shareToken?: string
  ) => {
    const { messages } = get();

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content };
    set({ messages: [...messages, userMessage], isLoading: true, error: null });

    try {
      const response = await apiClient.chat({
        messages: [...messages, userMessage],
        group_id: groupId,
        share_token: shareToken,
      });

      // Add assistant response
      const { messages: currentMessages } = get();
      set({
        messages: [...currentMessages, response],
        isLoading: false,
        error: null,
      });

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send message';
      set({ isLoading: false, error: errorMessage });
      return null;
    }
  },

  setFeedback: async (
    chatLogId: number,
    feedback: 'good' | 'bad' | null,
    shareToken?: string
  ) => {
    try {
      await apiClient.setChatFeedback(chatLogId, feedback, shareToken);

      // Update feedback in messages
      const { messages } = get();
      set({
        messages: messages.map((msg) =>
          msg.chat_log_id === chatLogId ? { ...msg, feedback } : msg
        ),
      });

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set feedback';
      set({ error: errorMessage });
      return false;
    }
  },

  reset: () => set(initialState),
}));
