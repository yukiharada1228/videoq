import {
  formatPlayerClock,
  landingDemoSceneAt,
  matchLandingDemoQuestion,
} from '../landingSamples'

describe('landingSamples', () => {
  const labels = {
    hard: '授業録画の見返しで何が大変？',
    jump: '質問するとどうなる？',
    own: '自分の講義でも使える？',
  }

  it('picks the scene for the current playback time', () => {
    expect(landingDemoSceneAt(0).key).toBe('hard')
    expect(landingDemoSceneAt(19.9).key).toBe('hard')
    expect(landingDemoSceneAt(20).key).toBe('jump')
    expect(landingDemoSceneAt(40).key).toBe('own')
    expect(landingDemoSceneAt(90).key).toBe('own')
  })

  it('matches prepared demo questions and ignores other wording', () => {
    expect(matchLandingDemoQuestion(' 質問するとどうなる？ ', labels)).toBe('jump')
    expect(matchLandingDemoQuestion('CNNとは？', labels)).toBeNull()
    expect(matchLandingDemoQuestion(' ', labels)).toBeNull()
  })

  it('formats the player clock', () => {
    expect(formatPlayerClock(0)).toBe('00:00')
    expect(formatPlayerClock(20)).toBe('00:20')
    expect(formatPlayerClock(61.9)).toBe('01:01')
  })
})
