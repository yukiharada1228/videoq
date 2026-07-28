// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Digital Agency registry utility boundary', () => {
  const appUtilsPath = resolve(__dirname, '../lib/utils.ts')
  const uiDirectory = resolve(__dirname, '../components/ui')

  it('does not recreate the legacy app utils entry point', () => {
    expect(existsSync(appUtilsPath)).toBe(false)
  })

  it('makes registry UI components use the namespaced cn directly', () => {
    const uiFiles = readdirSync(uiDirectory).filter((file) =>
      file.endsWith('.tsx'),
    )

    for (const file of uiFiles) {
      const content = readFileSync(resolve(uiDirectory, file), 'utf-8')
      expect(content).not.toMatch(/@\/lib\/utils/)
      expect(content).toMatch(/@\/lib\/digital-agency\/cn/)
    }
  })
})
