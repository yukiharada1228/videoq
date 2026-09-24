import { describe, it, expect } from 'vitest'
import { getStatusChipColor, getStatusLabel, formatDate } from '../video'

describe('video utils', () => {
  describe('getStatusChipColor', () => {
    it('should map statuses to chip colors', () => {
      expect(getStatusChipColor('completed')).toBe('green')
      expect(getStatusChipColor('pending')).toBe('gray')
      expect(getStatusChipColor('processing')).toBe('orange')
      expect(getStatusChipColor('error')).toBe('red')
      expect(getStatusChipColor('unknown')).toBe('gray')
    })
  })

  describe('getStatusLabel', () => {
    it('should return translation key for status', () => {
      expect(getStatusLabel('completed')).toBe('common.status.completed');
      expect(getStatusLabel('pending')).toBe('common.status.pending');
      expect(getStatusLabel('processing')).toBe('common.status.processing');
      expect(getStatusLabel('indexing')).toBe('common.status.indexing');
      expect(getStatusLabel('error')).toBe('common.status.error');
    });
  });

  describe('formatDate', () => {
    it('should format date with full format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date, 'full', 'en-US');
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should format date string with short format', () => {
      const dateString = '2024-01-15T10:30:00Z';
      const result = formatDate(dateString, 'short', 'en-US');
      expect(result).toContain('2024');
      expect(result).toContain('1');
    });

    it('should use default locale when not specified', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
