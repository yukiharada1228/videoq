import { DEFAULT_COPY, resolveFirstByteCopy } from '../pageCopy'
import {
  PUBLIC_INDEX_PATHS,
  absoluteUrl,
  hreflangEntries,
  isNoindexPath,
  localizedPath,
  pageMetaKey,
  withQueryAndHash,
} from '../seo'

describe('isNoindexPath', () => {
  it('keeps the marketing homepage indexable', () => {
    expect(isNoindexPath('/')).toBe(false)
  })

  it('marks app and auth screens as noindex', () => {
    expect(isNoindexPath('/videos')).toBe(true)
    expect(isNoindexPath('/videos/12')).toBe(true)
    expect(isNoindexPath('/settings')).toBe(true)
    expect(isNoindexPath('/admin')).toBe(true)
    expect(isNoindexPath('/login')).toBe(true)
    expect(isNoindexPath('/signup/check-email')).toBe(true)
    expect(isNoindexPath('/share/token')).toBe(true)
  })

  it('keeps public marketing and legal pages indexable', () => {
    expect(isNoindexPath('/pricing')).toBe(false)
    expect(isNoindexPath('/docs/openai')).toBe(false)
    expect(isNoindexPath('/terms')).toBe(false)
  })
})

describe('localizedPath and absoluteUrl', () => {
  it('leaves Japanese unprefixed', () => {
    expect(localizedPath('/pricing', 'ja')).toBe('/pricing')
    expect(absoluteUrl('/', 'ja')).toBe('https://videoq.jp/')
  })

  it('prefixes English URLs with /en', () => {
    expect(localizedPath('/', 'en')).toBe('/en/')
    expect(absoluteUrl('/pricing', 'en')).toBe('https://videoq.jp/en/pricing')
  })
})

describe('hreflangEntries', () => {
  it('emits ja, en, and Japanese x-default', () => {
    const entries = hreflangEntries('/docs')
    expect(entries).toEqual([
      { lang: 'ja', href: 'https://videoq.jp/docs' },
      { lang: 'en', href: 'https://videoq.jp/en/docs' },
      { lang: 'x-default', href: 'https://videoq.jp/docs' },
    ])
  })
})

describe('pageMetaKey', () => {
  it('maps known public paths', () => {
    expect(pageMetaKey('/')).toBe('site')
    expect(pageMetaKey('/pricing')).toBe('pricing')
    expect(pageMetaKey('/docs/chat')).toBe('docs:chat')
    expect(pageMetaKey('/legal')).toBe('legal.scta')
    expect(pageMetaKey('/share/token')).toBe('share:token')
  })

  it('treats a trailing slash as the same page', () => {
    expect(pageMetaKey('/docs/')).toBe('docs')
    expect(pageMetaKey('/docs/openai/')).toBe('docs:openai')
    expect(pageMetaKey('/pricing/')).toBe('pricing')
  })
})

describe('PUBLIC_INDEX_PATHS', () => {
  it('does not include app, auth, or share routes', () => {
    expect(PUBLIC_INDEX_PATHS).not.toContain('/videos')
    expect(PUBLIC_INDEX_PATHS).not.toContain('/login')
    expect(PUBLIC_INDEX_PATHS).not.toContain('/share/token')
    expect(PUBLIC_INDEX_PATHS).toContain('/')
    expect(PUBLIC_INDEX_PATHS).toContain('/pricing')
  })
})

describe('resolveFirstByteCopy', () => {
  it('keeps the homepage copy on /', () => {
    expect(resolveFirstByteCopy('ja', '/')).toEqual(DEFAULT_COPY.ja)
  })

  it('uses section copy for indexable docs pages', () => {
    expect(resolveFirstByteCopy('ja', '/docs/openai').title).toBe('OpenAI 互換 API | VideoQ')
    expect(resolveFirstByteCopy('en', '/docs/auth').title).toBe('Authentication and account | VideoQ')
    expect(resolveFirstByteCopy('ja', '/docs/openai').title).not.toBe(DEFAULT_COPY.ja.title)
  })

  it('keeps the same copy when the path has a trailing slash', () => {
    expect(resolveFirstByteCopy('ja', '/docs/')).toEqual(resolveFirstByteCopy('ja', '/docs'))
    expect(resolveFirstByteCopy('ja', '/pricing/')).toEqual(resolveFirstByteCopy('ja', '/pricing'))
    expect(resolveFirstByteCopy('en', '/docs/openai/').title).toBe(
      resolveFirstByteCopy('en', '/docs/openai').title,
    )
    expect(resolveFirstByteCopy('ja', '/docs/').title).not.toBe(DEFAULT_COPY.ja.title)
  })

  it('does not reuse the homepage title for other public index paths', () => {
    for (const path of PUBLIC_INDEX_PATHS) {
      if (path === '/') continue
      expect(resolveFirstByteCopy('ja', path).title).not.toBe(DEFAULT_COPY.ja.title)
      expect(resolveFirstByteCopy('en', path).title).not.toBe(DEFAULT_COPY.en.title)
    }
  })
})

describe('withQueryAndHash', () => {
  it('keeps search and hash when stripping a locale prefix', () => {
    expect(withQueryAndHash('/pricing', '?plan=pro', '#plans')).toBe('/pricing?plan=pro#plans')
  })
})
