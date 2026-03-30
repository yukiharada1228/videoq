// @vitest-environment node
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '../../public')

function getPngDimensions(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath)
  // PNG IHDR: bytes 16–23 are width and height (4 bytes each, big-endian)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return { width, height }
}

describe('PWA / favicon assets', () => {
  describe('icon files exist', () => {
    it('favicon.ico exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, 'favicon.ico'))).toBe(true)
    })

    it('apple-touch-icon.png exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, 'apple-touch-icon.png'))).toBe(true)
    })

    it('logo192.png exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, 'logo192.png'))).toBe(true)
    })

    it('logo512.png exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, 'logo512.png'))).toBe(true)
    })
  })

  describe('PNG dimensions', () => {
    it('apple-touch-icon.png is 180×180', () => {
      const { width, height } = getPngDimensions(
        resolve(PUBLIC_DIR, 'apple-touch-icon.png')
      )
      expect(width).toBe(180)
      expect(height).toBe(180)
    })

    it('logo192.png is 192×192', () => {
      const { width, height } = getPngDimensions(
        resolve(PUBLIC_DIR, 'logo192.png')
      )
      expect(width).toBe(192)
      expect(height).toBe(192)
    })

    it('logo512.png is 512×512', () => {
      const { width, height } = getPngDimensions(
        resolve(PUBLIC_DIR, 'logo512.png')
      )
      expect(width).toBe(512)
      expect(height).toBe(512)
    })
  })

  describe('manifest.json', () => {
    let manifest: Record<string, unknown>

    beforeAll(() => {
      const raw = readFileSync(resolve(PUBLIC_DIR, 'manifest.json'), 'utf-8')
      manifest = JSON.parse(raw)
    })

    it('exists and is valid JSON', () => {
      expect(existsSync(resolve(PUBLIC_DIR, 'manifest.json'))).toBe(true)
    })

    it('has name', () => {
      expect(manifest.name).toBeTruthy()
    })

    it('has short_name', () => {
      expect(manifest.short_name).toBeTruthy()
    })

    it('has start_url', () => {
      expect(manifest.start_url).toBeTruthy()
    })

    it('has display standalone or fullscreen', () => {
      expect(['standalone', 'fullscreen']).toContain(manifest.display)
    })

    it('has theme_color', () => {
      expect(manifest.theme_color).toBeTruthy()
    })

    it('has background_color', () => {
      expect(manifest.background_color).toBeTruthy()
    })

    it('has icons array with at least 192 and 512 entries', () => {
      const icons = manifest.icons as { src: string; sizes: string; type: string }[]
      expect(Array.isArray(icons)).toBe(true)
      const sizes = icons.map((i) => i.sizes)
      expect(sizes).toContain('192x192')
      expect(sizes).toContain('512x512')
    })
  })

  describe('index.html meta tags', () => {
    let html: string

    beforeAll(() => {
      html = readFileSync(resolve(PUBLIC_DIR, '../index.html'), 'utf-8')
    })

    it('has apple-touch-icon link', () => {
      expect(html).toMatch(/rel="apple-touch-icon"/)
    })

    it('apple-touch-icon href points to /apple-touch-icon.png', () => {
      expect(html).toMatch(/href="\/apple-touch-icon\.png"/)
    })

    it('has manifest link', () => {
      expect(html).toMatch(/rel="manifest"/)
    })

    it('manifest href points to /manifest.json', () => {
      expect(html).toMatch(/href="\/manifest\.json"/)
    })
  })
})
