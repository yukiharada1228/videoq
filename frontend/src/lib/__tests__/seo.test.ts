import {
  PUBLIC_INDEX_PATHS,
  absoluteUrl,
  hreflangEntries,
  isNoindexPath,
  localizedPath,
  pageMetaKey,
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
    expect(isNoindexPath('/share/yobinori-linearalgebra')).toBe(true)
    expect(isNoindexPath('/share/aicia-deeplearning')).toBe(true)
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
    expect(pageMetaKey('/share/yobinori-linearalgebra')).toBe('share:yobinori-linearalgebra')
  })
})

describe('PUBLIC_INDEX_PATHS', () => {
  it('does not include app, auth, or share routes', () => {
    expect(PUBLIC_INDEX_PATHS).not.toContain('/videos')
    expect(PUBLIC_INDEX_PATHS).not.toContain('/login')
    expect(PUBLIC_INDEX_PATHS).not.toContain('/share/yobinori-linearalgebra')
    expect(PUBLIC_INDEX_PATHS).not.toContain('/share/aicia-deeplearning')
    expect(PUBLIC_INDEX_PATHS).toContain('/')
    expect(PUBLIC_INDEX_PATHS).toContain('/pricing')
  })
})
