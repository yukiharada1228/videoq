import { describe, it, expect } from 'vitest';
import { getStatusBadgeClassName, getStatusLabel, formatDate } from '../video';

describe('video utils', () => {
  describe('getStatusBadgeClassName', () => {
    it('should return correct class for completed status with default size', () => {
      const result = getStatusBadgeClassName('completed');
      expect(result).toContain('bg-[#d3ffd5]');
      expect(result).toContain('text-[#006d30]');
      expect(result).toContain('px-3 py-1 text-sm'); // md size
    });

    it('should return correct class for pending status with xs size', () => {
      const result = getStatusBadgeClassName('pending', 'xs');
      expect(result).toContain('bg-stone-100');
      expect(result).toContain('text-stone-600');
      expect(result).toContain('px-1.5 py-0.5 text-[10px]');
    });

    it('should return correct class for processing status with sm size', () => {
      const result = getStatusBadgeClassName('processing', 'sm');
      expect(result).toContain('bg-[#ffdcc3]');
      expect(result).toContain('text-[#2f1500]');
      expect(result).toContain('px-2.5 py-0.5 text-xs');
    });

    it('should return correct class for error status', () => {
      const result = getStatusBadgeClassName('error');
      expect(result).toContain('bg-red-100');
      expect(result).toContain('text-red-700');
    });

    it('should return correct class for indexing status', () => {
      const result = getStatusBadgeClassName('indexing');
      expect(result).toContain('bg-[#ffdcc3]');
      expect(result).toContain('text-[#2f1500]');
    });

    it('should return default class for unknown status', () => {
      const result = getStatusBadgeClassName('unknown');
      expect(result).toContain('bg-stone-100');
      expect(result).toContain('text-stone-600');
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
