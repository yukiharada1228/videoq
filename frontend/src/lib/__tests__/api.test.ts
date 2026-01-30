import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../api';

describe('ApiClient', () => {
  let originalLocation: Location;

  beforeEach(() => {
    // Save original location
    originalLocation = window.location;

    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        origin: 'http://localhost:3000',
      },
    });
  });

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  describe('getVideoUrl', () => {
    it('should convert relative path to absolute URL with current origin', () => {
      const videoFile = '/api/media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4');
    });

    it('should handle URL with query parameters', () => {
      const videoFile = '/api/media/videos/1/video.mp4?v=123';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4?v=123');
    });

    it('should preserve hash in URL', () => {
      const videoFile = '/api/media/videos/1/video.mp4#t=10';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4#t=10');
    });

    it('should work with different port numbers', () => {
      // Change origin to non-standard port
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          ...originalLocation,
          origin: 'http://localhost:60158',
        },
      });

      const videoFile = '/api/media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('http://localhost:60158/api/media/videos/1/video.mp4');
    });

    it('should rewrite absolute API URL with frontend origin', () => {
      const videoFile = 'http://localhost:8000/api/media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4');
    });

    it('should preserve external URLs like S3 without rewriting', () => {
      const videoFile = 'https://s3.amazonaws.com/bucket/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(videoFile);
      expect(result).toBe('https://s3.amazonaws.com/bucket/videos/1/video.mp4');
    });
  });

  describe('getSharedVideoUrl', () => {
    it('should add share_token query parameter to relative path', () => {
      const videoFile = '/api/media/videos/1/video.mp4';
      const shareToken = 'test-token-123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4?share_token=test-token-123');
    });

    it('should append share_token to existing query parameters', () => {
      const videoFile = '/api/media/videos/1/video.mp4?v=123';
      const shareToken = 'test-token-456';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4?v=123&share_token=test-token-456');
    });

    it('should preserve hash in URL', () => {
      const videoFile = '/api/media/videos/1/video.mp4#t=10';
      const shareToken = 'test-token-789';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4?share_token=test-token-789#t=10');
    });

    it('should work with different port numbers', () => {
      // Change origin to non-standard port
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          ...originalLocation,
          origin: 'http://localhost:60158',
        },
      });

      const videoFile = '/api/media/videos/1/video.mp4';
      const shareToken = 'test-token-abc';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:60158/api/media/videos/1/video.mp4?share_token=test-token-abc');
    });

    it('should rewrite absolute API URL with frontend origin and add share_token', () => {
      const videoFile = 'http://localhost:8000/api/media/videos/1/video.mp4';
      const shareToken = 'test-token-def';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:3000/api/media/videos/1/video.mp4?share_token=test-token-def');
    });

    it('should add share_token to external URLs like S3 without rewriting origin', () => {
      const videoFile = 'https://s3.amazonaws.com/bucket/videos/1/video.mp4';
      const shareToken = 'test-token-ghi';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('https://s3.amazonaws.com/bucket/videos/1/video.mp4?share_token=test-token-ghi');
    });
  });
});
