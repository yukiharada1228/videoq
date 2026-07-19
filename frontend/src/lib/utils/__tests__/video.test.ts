import { describe, it, expect } from 'vitest'
import { getStatusBadgeClassName, getStatusChipColor, getStatusLabel, formatDate } from '../video'

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

  describe('getStatusBadgeClassName', () => {
    it('should return correct class for completed status with default size', () => {
      const result = getStatusBadgeClassName('completed');
      expect(result).toContain('bg-green-50');
      expect(result).toContain('text-green-900');
      expect(result).toContain('px-3 py-1 text-oln-16N-100');
    });

    it('should return correct class for pending status with xs size', () => {
      const result = getStatusBadgeClassName('pending', 'xs');
      expect(result).toContain('bg-solid-gray-50');
      expect(result).toContain('text-solid-gray-800');
      expect(result).toContain('px-1.5 py-0.5 text-oln-14N-100');
    });

    it('should return correct class for processing status with sm size', () => {
      const result = getStatusBadgeClassName('processing', 'sm');
      expect(result).toContain('bg-orange-50');
      expect(result).toContain('text-orange-1000');
      expect(result).toContain('px-2 py-0.5 text-oln-14N-100');
    });

    it('should return correct class for error status', () => {
      const result = getStatusBadgeClassName('error');
      expect(result).toContain('bg-red-50');
      expect(result).toContain('text-red-1000');
    });

    it('should return correct class for indexing status', () => {
      const result = getStatusBadgeClassName('indexing');
      expect(result).toContain('bg-orange-50');
      expect(result).toContain('text-orange-1000');
    });

    it('should return default class for unknown status', () => {
      const result = getStatusBadgeClassName('unknown');
      expect(result).toContain('bg-solid-gray-50');
      expect(result).toContain('text-solid-gray-800');
    });
  });

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
