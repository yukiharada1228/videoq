import { oauthAuthorizeResumeUrl, OAUTH_AUTHORIZE_PATH } from '../oauthResume'

describe('oauthAuthorizeResumeUrl', () => {
  it('resumes a signed authorize query', () => {
    const search =
      'client_id=abc&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2Fcb&response_type=code&scope=openid'
    expect(oauthAuthorizeResumeUrl(search)).toBe(`${OAUTH_AUTHORIZE_PATH}?${search}`)
  })

  it('accepts URLSearchParams with a leading question mark in the string form', () => {
    expect(
      oauthAuthorizeResumeUrl('?client_id=abc&redirect_uri=https://chatgpt.com/cb'),
    ).toBe(`${OAUTH_AUTHORIZE_PATH}?client_id=abc&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcb`)
  })

  it('rejects missing OAuth fields', () => {
    expect(oauthAuthorizeResumeUrl('next=/videos')).toBeNull()
    expect(oauthAuthorizeResumeUrl('client_id=abc')).toBeNull()
    expect(oauthAuthorizeResumeUrl('redirect_uri=https://chatgpt.com/cb')).toBeNull()
  })

  it('rejects non-http redirect URIs and non-code response types', () => {
    expect(
      oauthAuthorizeResumeUrl('client_id=abc&redirect_uri=javascript:alert(1)'),
    ).toBeNull()
    expect(
      oauthAuthorizeResumeUrl(
        'client_id=abc&redirect_uri=https://chatgpt.com/cb&response_type=token',
      ),
    ).toBeNull()
  })
})
