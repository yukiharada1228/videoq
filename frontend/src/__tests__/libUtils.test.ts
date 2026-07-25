// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

// `src/lib/utils.ts` is vendored verbatim from the shadcn-digital-agency-jp
// design system registry — it is the `cn` helper. The shadcn CLI overwrites
// this file whenever a component is added, so any app-specific code placed
// here would be silently lost on the next sync.
//
// Keep app utilities in their own modules (e.g. src/lib/video/*,
// src/lib/errorHandling.ts) — never in utils.ts. This guard fails CI if the
// file grows exports beyond `cn`.
describe('src/lib/utils.ts (vendored shadcn cn)', () => {
  const content = readFileSync(resolve(__dirname, '../lib/utils.ts'), 'utf-8')

  it('exports only `cn` (no app-specific helpers)', () => {
    const valueExports = [
      ...content.matchAll(
        /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_]+)/g,
      ),
    ].map((m) => m[1])
    expect(valueExports).toEqual(['cn'])
  })

  it('has no re-export, type, or default exports', () => {
    expect(content).not.toMatch(/export\s+\{/)
    expect(content).not.toMatch(/export\s+(?:type|interface)\b/)
    expect(content).not.toMatch(/export\s+default\b/)
  })
})
