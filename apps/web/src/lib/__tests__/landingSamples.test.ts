import { formatPlayerClock, landingDemoMedia } from '../landingSamples'

describe('landingSamples', () => {
  it('uses matching local video, captions and poster for each supported language', () => {
    expect(landingDemoMedia('en-US')).toEqual({
      locale: 'en', shareSlug: 'videoq-demo-en-v1', video: '/demo/explain-en.mp4', captions: '/demo/explain-en.vtt', poster: '/demo/explain-en-poster.webp',
    })
    expect(landingDemoMedia('ja').video).toBe('/demo/explain-ja.mp4')
    expect(landingDemoMedia().locale).toBe('ja')
  })
  it('formats timestamps used for source navigation', () => {
    expect(formatPlayerClock(0)).toBe('00:00')
    expect(formatPlayerClock(20)).toBe('00:20')
    expect(formatPlayerClock(61.9)).toBe('01:01')
  })
})
