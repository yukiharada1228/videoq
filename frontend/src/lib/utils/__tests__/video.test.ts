import { describe, it, expect } from 'vitest';
import { getStatusLabel, timeStringToSeconds } from '../video';

describe('video utils', () => {
  describe('getStatusLabel', () => {
    it('should return translation key for status', () => {
      expect(getStatusLabel('pending')).toBe('common.status.pending');
      expect(getStatusLabel('processing')).toBe('common.status.processing');
      expect(getStatusLabel('completed')).toBe('common.status.completed');
      expect(getStatusLabel('error')).toBe('common.status.error');
    });

    it('should handle unknown status', () => {
      expect(getStatusLabel('unknown')).toBe('common.status.unknown');
    });
  });

  describe('timeStringToSeconds', () => {
    it('should convert HH:MM:SS format to seconds', () => {
      expect(timeStringToSeconds('01:30:45')).toBe(5445); // 1*3600 + 30*60 + 45
      expect(timeStringToSeconds('00:00:30')).toBe(30);
      expect(timeStringToSeconds('02:00:00')).toBe(7200);
    });

    it('should convert MM:SS format to seconds', () => {
      expect(timeStringToSeconds('05:30')).toBe(330); // 5*60 + 30
      expect(timeStringToSeconds('00:45')).toBe(45);
      expect(timeStringToSeconds('10:00')).toBe(600);
    });

    it('should convert SS format to seconds', () => {
      expect(timeStringToSeconds('45')).toBe(45);
      expect(timeStringToSeconds('120')).toBe(120);
    });

    it('should handle time with milliseconds', () => {
      expect(timeStringToSeconds('01:30:45,123')).toBe(5445);
      expect(timeStringToSeconds('01:30:45.456')).toBe(5445);
    });

    it('should return 0 for empty or invalid input', () => {
      expect(timeStringToSeconds('')).toBe(0);
      expect(timeStringToSeconds('invalid')).toBe(0);
      expect(timeStringToSeconds(':::')).toBe(0);
    });
  });
});
