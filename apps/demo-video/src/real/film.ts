import { createContext, useContext } from 'react';
import type { ChatHistoryItem } from '@/lib/api';
import type { Message } from '@/hooks/useChatMessages';

export type Locale = 'ja' | 'en';

// Everything the swapped hooks return. Each scene derives it from the frame, so
// any frame renders the same way regardless of the order frames are visited.
export type FilmState = {
  chat: { messages: Message[]; input: string; isLoading: boolean };
  history: ChatHistoryItem[];
  playback: { videoId: number; seconds: number };
  upload: { title: string; isUploading: boolean; progress: number; success: boolean };
};

export const FilmContext = createContext<FilmState | null>(null);

export function useFilm() {
  const film = useContext(FilmContext);
  if (!film) throw new Error('A film scene must provide the product state.');
  return film;
}
