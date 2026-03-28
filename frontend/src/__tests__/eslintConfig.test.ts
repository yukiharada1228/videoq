// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('eslint.config.js', () => {
  const configContent = readFileSync(
    resolve(__dirname, '../../eslint.config.js'),
    'utf-8',
  )

  it('ignores coverage directory', () => {
    expect(configContent).toMatch(/globalIgnores\(\[.*'coverage'.*\]\)/s)
  })
})
