// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('eslint.config.js', () => {
  const configContent = readFileSync(
    resolve(__dirname, '../../eslint.config.js'),
    'utf-8',
  )

  it('ignores coverage directory', () => {
    expect(configContent).toMatch(/globalIgnores\(\[.*'coverage'.*\]\)/s)
  })

  it.each([
    ['src/pages/ExamplePage.tsx', '@/components/layout/AppPageShell', 'AppPageShell'],
    ['src/pages/ExamplePage.tsx', '../components/layout/AuthLayout', 'AuthLayout'],
    ['src/pages/ExamplePage.tsx', '@/components/layout/AppFooter.tsx', 'AppFooter'],
    ['src/components/video/ExampleView.tsx', '@/components/layout/AppNav', 'AppNav'],
  ])('rejects page-owned layout imports in %s from %s', async (filePath, source, name) => {
    const eslint = new ESLint({ cwd: resolve(__dirname, '../..') })
    const [result] = await eslint.lintText(
      `import { ${name} } from '${source}'; export default function Example() { return <${name} />; }`,
      { filePath },
    )
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
    ]))
  })
})
