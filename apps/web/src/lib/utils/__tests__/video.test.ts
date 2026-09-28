import { describe, it, expect } from 'vitest'
import { getStatusChipColor, getStatusLabel, formatDate, timeStringToSeconds } from '../video'

describe('video utils', () => {
  it.each([
    ['00:01:02,500', 62.5], ['00:01:02.500', 62.5], ['1:02.5', 62.5],
    ['62.25', 62.25], ['01 : 02 : 03,125', 3723.125], ['90:00', 5400],
    ['', 0], ['-1', 0], ['01:60', 0], ['00:99:00', 0],
    ['01:30oops', 0], ['1e3', 0], ['1:2:3:4', 0], ['Infinity', 0],
  ])('converts %s to a finite playback position', (value, seconds) => {
    expect(timeStringToSeconds(value)).toBe(seconds)
  })

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
