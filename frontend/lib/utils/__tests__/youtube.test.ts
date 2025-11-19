import { extractYouTubeVideoId, getYouTubeEmbedUrl } from '../youtube';

describe('youtube utils', () => {
  describe('extractYouTubeVideoId', () => {
    it('should extract video ID from standard YouTube watch URL', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from YouTube embed URL', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from YouTube watch URL with additional parameters', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from YouTube embed URL with parameters', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ?start=42';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be URL with parameters', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ?t=42';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from mobile YouTube URL', () => {
      const url = 'https://m.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should return null for empty string', () => {
      expect(extractYouTubeVideoId('')).toBeNull();
    });

    it('should return null for invalid URL', () => {
      expect(extractYouTubeVideoId('https://example.com/video')).toBeNull();
    });

    it('should return null for non-YouTube URL', () => {
      expect(extractYouTubeVideoId('https://vimeo.com/123456789')).toBeNull();
    });

    it('should return null for YouTube URL without video ID', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch')).toBeNull();
    });

    it('should return null for YouTube URL with invalid video ID length', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    });

    it('should extract video ID from URL with http (not https)', () => {
      const url = 'http://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from URL without protocol', () => {
      const url = 'www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle URL with hash fragment', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=42';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle youtu.be URL with hash fragment', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ#t=42';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle embed URL with additional path', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ/extra';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle youtu.be URL with additional path', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ/extra';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should return null for youtu.be URL with invalid video ID length', () => {
      expect(extractYouTubeVideoId('https://youtu.be/short')).toBeNull();
    });

    it('should return null for embed URL with invalid video ID length', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/short')).toBeNull();
    });

    it('should extract video ID using URL parsing when pattern matching fails', () => {
      // URL that requires parsing (e.g., with special characters in path)
      const url = 'https://www.youtube.com/watch?feature=player_embedded&v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle YouTube URL with subdomain', () => {
      const url = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should handle youtu.be URL with subdomain', () => {
      const url = 'https://www.youtu.be/dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should return null for YouTube URL with watch path but no video ID parameter', () => {
      const url = 'https://www.youtube.com/watch?feature=player_embedded';
      expect(extractYouTubeVideoId(url)).toBeNull();
    });

    it('should return null for embed URL with empty video ID', () => {
      const url = 'https://www.youtube.com/embed/';
      expect(extractYouTubeVideoId(url)).toBeNull();
    });

    it('should return null for youtu.be URL with empty path', () => {
      const url = 'https://youtu.be/';
      expect(extractYouTubeVideoId(url)).toBeNull();
    });
  });

  describe('getYouTubeEmbedUrl', () => {
    it('should return embed URL from video ID', () => {
      const videoId = 'dQw4w9WgXcQ';
      expect(getYouTubeEmbedUrl(videoId)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should return embed URL from YouTube watch URL', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(getYouTubeEmbedUrl(url)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should return embed URL from youtu.be URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(getYouTubeEmbedUrl(url)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should return embed URL from YouTube embed URL', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
      expect(getYouTubeEmbedUrl(url)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should return null for invalid URL', () => {
      expect(getYouTubeEmbedUrl('https://example.com/video')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getYouTubeEmbedUrl('')).toBeNull();
    });

    it('should return null for invalid video ID length', () => {
      expect(getYouTubeEmbedUrl('short')).toBeNull();
    });
  });
});

