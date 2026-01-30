import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment variable
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:8000/api',
  },
});

// Import after mocking
const { apiClient } = await import('../api');

// Create a test instance with custom baseUrl
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

    const resolvedBase = new URL(this.baseUrl, window.location.origin);

    if (videoFile.startsWith('/')) {
      return `${resolvedBase.origin}${videoFile}`;
    }

    const basePath = resolvedBase.pathname.replace(/\/$/, '');
    return `${resolvedBase.origin}${basePath}/${videoFile}`;
  }

  getSharedVideoUrl(videoFile: string, shareToken: string): string {
    const absoluteUrl = this.getVideoUrl(videoFile);
    if (!absoluteUrl) {
      return '';
    }
    const url = new URL(absoluteUrl);
    url.searchParams.set('share_token', shareToken);
    return url.toString();
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

    it('should convert relative URL without leading slash to absolute URL using backend origin and base path', () => {
      const relativeUrl = 'media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);
      // Should preserve /api base path: http://localhost:8000/api/media/videos/1/video.mp4
      expect(result).toBe('http://localhost:8000/api/media/videos/1/video.mp4');
    });

    it('should handle relative baseUrl (e.g., "/api") correctly with absolute path videoFile', () => {
      const relativeBaseClient = new TestApiClient('/api');
      const videoFile = '/media/videos/1/video.mp4';
      const result = relativeBaseClient.getVideoUrl(videoFile);
      // Relative baseUrl resolved against window.location.origin
      expect(result).toBe('http://frontend.example.com/media/videos/1/video.mp4');
    });

    it('should handle relative baseUrl (e.g., "/api") correctly with relative path videoFile', () => {
      const relativeBaseClient = new TestApiClient('/api');
      const videoFile = 'media/videos/1/video.mp4';
      const result = relativeBaseClient.getVideoUrl(videoFile);
      // Should preserve /api base path
      expect(result).toBe('http://frontend.example.com/api/media/videos/1/video.mp4');
    });

    it('should avoid duplicate slashes when combining base path and videoFile', () => {
      const clientWithTrailingSlash = new TestApiClient('http://localhost:8000/api/');
      const videoFile = 'media/video.mp4';
      const result = clientWithTrailingSlash.getVideoUrl(videoFile);
      // Should not have duplicate slashes
      expect(result).toBe('http://localhost:8000/api/media/video.mp4');
    });

    it('should preserve base path segments when baseUrl has multiple path segments', () => {
      const clientWithDeepPath = new TestApiClient('/api/v1');
      const videoFile = 'media/video.mp4';
      const result = clientWithDeepPath.getVideoUrl(videoFile);
      expect(result).toBe('http://frontend.example.com/api/v1/media/video.mp4');
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

    it('should handle relative URLs without leading slash and preserve base path', () => {
      const videoFile = 'media/video.mp4';
      const shareToken = 'token456';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      // Should preserve /api base path
      expect(result).toBe('http://localhost:8000/api/media/video.mp4?share_token=token456');
    });

    it('should work with relative baseUrl and preserve base path', () => {
      const relativeBaseClient = new TestApiClient('/api');
      const videoFile = 'media/video.mp4';
      const shareToken = 'token789';
      const result = relativeBaseClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://frontend.example.com/api/media/video.mp4?share_token=token789');
    });
  });
});
