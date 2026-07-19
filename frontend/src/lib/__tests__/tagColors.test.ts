import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAG_CHIP_COLOR,
  isTagChipColor,
  resolveTagChipColor,
  TAG_CHIP_COLORS,
} from '../tagColors'

describe('tagColors', () => {
  it('includes the Digital Agency ChipLabel palette', () => {
    expect(TAG_CHIP_COLORS).toContain('blue')
    expect(TAG_CHIP_COLORS).toContain('light-blue')
    expect(DEFAULT_TAG_CHIP_COLOR).toBe('blue')
  })

  it('accepts palette names as-is', () => {
    expect(isTagChipColor('magenta')).toBe(true)
    expect(resolveTagChipColor('orange')).toBe('orange')
  })

  it('maps legacy hex colors to the palette', () => {
    expect(resolveTagChipColor('#3B82F6')).toBe('blue')
    expect(resolveTagChipColor('#ef4444')).toBe('red')
  })

  it('falls back to the default for unknown values', () => {
    expect(isTagChipColor('pink')).toBe(false)
    expect(resolveTagChipColor('pink')).toBe('blue')
  })
})
