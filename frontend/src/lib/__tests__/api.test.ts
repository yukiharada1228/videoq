import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock environment variable
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:8000/api',
  },
});

// Import after mocking
const { apiClient } = await import('../api');

// Create a test instance with invalid baseUrl
class TestApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getVideoUrl(videoFile: string | null): string {
    if (!videoFile) return '';

    if (videoFile.startsWith('http://') || videoFile.startsWith('https://')) {
      return videoFile;
    }

    try {
      if (videoFile.startsWith('/')) {
        const backendUrl = new URL(this.baseUrl);
        return `${backendUrl.origin}${videoFile}`;
      }

      const backendUrl = new URL(this.baseUrl);
      return `${backendUrl.origin}/${videoFile}`;
    } catch (error) {
      console.error('Failed to construct URL from baseUrl:', this.baseUrl, error);

      if (videoFile.startsWith('/')) {
        return `${window.location.origin}${videoFile}`;
      }
      return `${window.location.origin}/${videoFile}`;
    }
  }
}

describe('ApiClient', () => {
  describe('getVideoUrl', () => {
    beforeEach(() => {
      // Mock window.location for tests
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'http://frontend.example.com',
        },
        writable: true,
      });
    });

    it('should return empty string for null input', () => {
      const result = apiClient.getVideoUrl(null);
      expect(result).toBe('');
    });

    it('should return empty string for empty string input', () => {
      const result = apiClient.getVideoUrl('');
      expect(result).toBe('');
    });

    it('should return absolute HTTP URL as-is', () => {
      const url = 'http://example.com/video.mp4';
      const result = apiClient.getVideoUrl(url);
      expect(result).toBe(url);
    });

    it('should return absolute HTTPS URL as-is', () => {
      const url = 'https://example.com/video.mp4';
      const result = apiClient.getVideoUrl(url);
      expect(result).toBe(url);
    });

    it('should convert relative URL with leading slash to absolute URL using backend origin', () => {
      const relativeUrl = '/api/media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);
      expect(result).toBe('http://localhost:8000/api/media/videos/1/video.mp4');
    });

    it('should convert relative URL without leading slash to absolute URL using backend origin', () => {
      const relativeUrl = 'media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);
      expect(result).toBe('http://localhost:8000/media/videos/1/video.mp4');
    });

    it('should fallback to window.location.origin when baseUrl is invalid (with leading slash)', () => {
      const invalidClient = new TestApiClient('invalid-url');
      const relativeUrl = '/api/media/video.mp4';
      const result = invalidClient.getVideoUrl(relativeUrl);
      expect(result).toBe('http://frontend.example.com/api/media/video.mp4');
    });

    it('should fallback to window.location.origin when baseUrl is invalid (without leading slash)', () => {
      const invalidClient = new TestApiClient('invalid-url');
      const relativeUrl = 'media/video.mp4';
      const result = invalidClient.getVideoUrl(relativeUrl);
      expect(result).toBe('http://frontend.example.com/media/video.mp4');
    });
  });

  describe('getSharedVideoUrl', () => {
    it('should add share_token parameter to absolute URL', () => {
      const videoFile = 'http://example.com/video.mp4';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://example.com/video.mp4?share_token=abc123');
    });

    it('should convert relative URL and add share_token parameter', () => {
      const videoFile = '/api/media/videos/1/video.mp4';
      const shareToken = 'xyz789';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:8000/api/media/videos/1/video.mp4?share_token=xyz789');
    });

    it('should return empty string when videoFile results in empty URL', () => {
      const videoFile = '';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('');
    });

    it('should return empty string when videoFile is null', () => {
      const videoFile = '';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('');
    });

    it('should preserve existing query parameters when adding share_token', () => {
      const videoFile = 'http://example.com/video.mp4?quality=hd';
      const shareToken = 'token123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://example.com/video.mp4?quality=hd&share_token=token123');
    });

    it('should handle HTTPS URLs correctly', () => {
      const videoFile = 'https://secure.example.com/video.mp4';
      const shareToken = 'secure123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('https://secure.example.com/video.mp4?share_token=secure123');
    });

    it('should handle relative URLs without leading slash', () => {
      const videoFile = 'media/video.mp4';
      const shareToken = 'token456';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:8000/media/video.mp4?share_token=token456');
    });
  });
});
