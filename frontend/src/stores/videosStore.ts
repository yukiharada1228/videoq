import { create } from 'zustand';
import { apiClient, type Video, type VideoList } from '@/lib/api';

interface VideosState {
  videos: VideoList[];
  currentVideo: Video | null;
  isLoading: boolean;
  error: string | null;
  setVideos: (videos: VideoList[]) => void;
  setCurrentVideo: (video: Video | null) => void;
  loadVideos: (tagIds?: number[]) => Promise<void>;
  loadVideo: (id: number) => Promise<void>;
  updateVideoInList: (id: number, updates: Partial<VideoList>) => void;
  removeVideoFromList: (id: number) => void;
  reset: () => void;
}

const initialState = {
  videos: [],
  currentVideo: null,
  isLoading: false,
  error: null,
};

export const useVideosStore = create<VideosState>((set, get) => ({
  ...initialState,

  setVideos: (videos) => set({ videos }),

  setCurrentVideo: (currentVideo) => set({ currentVideo }),

  loadVideos: async (tagIds?: number[]) => {
    set({ isLoading: true, error: null });
    try {
      const videos = await apiClient.getVideos({ tags: tagIds });
      set({ videos, isLoading: false, error: null });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load videos';
      set({ isLoading: false, error: errorMessage });
    }
  },

  loadVideo: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const video = await apiClient.getVideo(id);
      set({ currentVideo: video, isLoading: false, error: null });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load video';
      set({ currentVideo: null, isLoading: false, error: errorMessage });
    }
  },

  updateVideoInList: (id, updates) => {
    const { videos } = get();
    set({
      videos: videos.map((video) =>
        video.id === id ? { ...video, ...updates } : video
      ),
    });
  },

  removeVideoFromList: (id) => {
    const { videos } = get();
    set({ videos: videos.filter((video) => video.id !== id) });
  },

  reset: () => set(initialState),
}));
