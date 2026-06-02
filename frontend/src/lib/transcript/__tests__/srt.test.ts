import { describe, expect, it } from 'vitest';
import { filterTranscriptSegments, isSrtFormat, parseSrtTranscript } from '../srt';

describe('parseSrtTranscript', () => {
  it('parses SRT blocks into seekable transcript segments', () => {
    const srt = [
      '1',
      '00:00:01,250 --> 00:00:03,000',
      'Hello',
      'world',
      '',
      '2',
      '00:01:02.500 --> 00:01:04.000',
      'Second segment',
    ].join('\n');

    expect(parseSrtTranscript(srt)).toEqual([
      { timestamp: '00:00:01', seconds: 1, text: 'Hello world' },
      { timestamp: '00:01:02', seconds: 62, text: 'Second segment' },
    ]);
  });

  it('ignores malformed or empty caption blocks', () => {
    const srt = [
      'not a caption',
      '',
      '2',
      '00:00:10,000 --> 00:00:12,000',
      '',
      '3',
      '00:00:13,000 --> 00:00:15,000',
      'Valid caption',
    ].join('\n');

    expect(parseSrtTranscript(srt)).toEqual([
      { timestamp: '00:00:13', seconds: 13, text: 'Valid caption' },
    ]);
  });
});

describe('isSrtFormat', () => {
  it('detects SRT timing lines with comma or dot millisecond separators', () => {
    expect(isSrtFormat('00:00:01,000 --> 00:00:02,000\nText')).toBe(true);
    expect(isSrtFormat('00:00:01.000 --> 00:00:02.000\nText')).toBe(true);
    expect(isSrtFormat('plain transcript')).toBe(false);
  });
});

describe('filterTranscriptSegments', () => {
  const segments = [
    { timestamp: '00:00:01', seconds: 1, text: 'Opening remarks' },
    { timestamp: '00:00:05', seconds: 5, text: 'Deep dive into React patterns' },
  ];

  it('returns all segments for blank queries', () => {
    expect(filterTranscriptSegments(segments, '  ')).toEqual(segments);
  });

  it('filters segments case-insensitively by text', () => {
    expect(filterTranscriptSegments(segments, 'react')).toEqual([segments[1]]);
  });
});
