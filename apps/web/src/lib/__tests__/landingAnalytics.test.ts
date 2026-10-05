import { completeSignupTracking, getLandingAcquisition, getLandingAudience, startLandingVisit, trackLandingEvent } from '../landingAnalytics';

const originalLocation = window.location;

describe('landing funnel measurement', () => {
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => {
    sessionStorage.clear();
    send.mockClear();
    vi.stubEnv('PROD', true);
    vi.stubGlobal('fetch', send);
    Object.defineProperty(window, 'location', {
      configurable: true, value: new URL('https://videoq.jp/?audience=training&utm_campaign=private-value'),
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('deduplicates each funnel stage and sends only allowlisted dimensions', () => {
    startLandingVisit();
    startLandingVisit();
    trackLandingEvent('demo_source');
    trackLandingEvent('demo_source');
    trackLandingEvent('signup_click', 'hero');
    expect(send).toHaveBeenCalledTimes(3);
    const [path, init] = send.mock.calls[2];
    expect(path).toBe('/__events/landing');
    expect(JSON.parse(init.body)).toEqual({ event: 'signup_click', placement: 'hero', audience: 'training', locale: 'ja', acquisition: 'unattributed' });
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(JSON.stringify(send.mock.calls)).not.toContain('private-value');
    expect(JSON.stringify(sessionStorage)).not.toContain('private-value');
  });

  it('keeps the fixed ad cohort through same-tab signup without sending URL data', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL(
      'https://videoq.jp/?utm_source=x&utm_medium=paid_social&utm_campaign=student_demo_test&utm_content=demo15_search&twclid=private-click-id',
    ) });
    startLandingVisit();
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://videoq.jp/signup') });
    trackLandingEvent('signup_view');
    trackLandingEvent('email_signup_created');
    expect(send.mock.calls.map(([, init]) => JSON.parse(init.body).acquisition))
      .toEqual(['x_paid_demo15_search', 'x_paid_demo15_search', 'x_paid_demo15_search']);
    for (const data of [JSON.stringify(send.mock.calls), JSON.stringify(sessionStorage)]) {
      expect(data).not.toContain('private-click-id');
      expect(data).not.toContain('utm_');
    }
  });

  it.each([
    ['?utm_source=x&utm_medium=organic_social&utm_campaign=launch&utm_content=intro', 'x_organic_launch'],
    ['?utm_source=x&utm_medium=organic_social&utm_campaign=launch&utm_content=howto', 'x_organic_launch'],
    ['?utm_source=x&utm_medium=organic_social&utm_campaign=launch&utm_content=usecase', 'x_organic_launch'],
    ['?utm_source=x&utm_medium=paid_social&utm_campaign=private-value&utm_content=demo15_search', 'unattributed'],
    ['?utm_source=other&utm_medium=paid_social&utm_campaign=student_demo_test&utm_content=demo15_search', 'unattributed'],
    ['?utm_source=x', 'unattributed'],
    ['', 'unattributed'],
  ])('classifies only known campaign links: %s', (search, expected) => {
    expect(getLandingAcquisition(search)).toBe(expected);
  });

  it.each([undefined, 'private-value'])('keeps old or unknown stored cohorts anonymous: %s', acquisition => {
    sessionStorage.setItem('videoq.landing.student-v1', JSON.stringify({
      audience: 'student', seen: ['landing_view'], updated: Date.now(), acquisition,
    }));
    trackLandingEvent('email_signup_created');
    expect(JSON.parse(send.mock.calls[0][1].body).acquisition).toBe('unattributed');
    expect(JSON.stringify(send.mock.calls)).not.toContain('private-value');
    expect(JSON.stringify(sessionStorage)).not.toContain('private-value');
  });

  it('does not attribute unrelated account activity to the LP', () => {
    trackLandingEvent('email_signup_created');
    trackLandingEvent('first_answer');
    expect(send).not.toHaveBeenCalled();
  });

  it('counts email verification only after a same-tab email signup and deduplicates the callback', () => {
    startLandingVisit();
    completeSignupTracking('email');
    expect(fetch).toHaveBeenCalledTimes(1);
    trackLandingEvent('email_signup_created');
    completeSignupTracking('email');
    completeSignupTracking('email');
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string).event))
      .toEqual(['landing_view', 'email_signup_created', 'email_verified']);
  });

  it('counts a Google signup only after a same-tab OAuth attempt and deduplicates the callback', () => {
    startLandingVisit();
    completeSignupTracking('google');
    expect(send).toHaveBeenCalledTimes(1);
    trackLandingEvent('google_auth_started');
    completeSignupTracking('google');
    completeSignupTracking('google');
    expect(send.mock.calls.map(([, init]) => JSON.parse(init.body).event))
      .toEqual(['landing_view', 'google_auth_started', 'google_signup_created']);
  });

  it('keeps diagnostic traffic out of the paid cohort throughout the funnel', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL(
      'https://videoq.jp/?utm_source=x&utm_medium=paid_social&utm_campaign=student_demo_test&utm_content=demo15_search',
    ) });
    startLandingVisit();
    Object.defineProperty(window, 'location', { configurable: true, value: new URL(
      `${window.location.href}&measurement=test`,
    ) });
    startLandingVisit();
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://videoq.jp/signup') });
    for (const event of ['signup_view', 'google_auth_started', 'video_upload_started', 'video_upload_accepted', 'first_answer'] as const) {
      trackLandingEvent(event);
    }
    completeSignupTracking('google');
    expect(send.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body).acquisition))
      .toEqual(Array(7).fill('internal_test'));
  });

  it('records a new visit after the attribution window expires', () => {
    startLandingVisit();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000);
    trackLandingEvent('first_answer');
    expect(send).toHaveBeenCalledTimes(1);
    startLandingVisit();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not collect in development, previews, or when Do Not Track is enabled', () => {
    vi.stubEnv('PROD', false);
    startLandingVisit();
    vi.stubEnv('PROD', true);
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://preview.example/') });
    startLandingVisit();
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://videoq.jp/') });
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    startLandingVisit();
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    startLandingVisit();
    expect(send).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('leaves the product usable when storage or the network is unavailable', () => {
    send.mockRejectedValueOnce(new Error('Offline'));
    expect(() => startLandingVisit()).not.toThrow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(() => trackLandingEvent('demo_question')).not.toThrow();
  });

  it.each([
    ['', 'general'],
    ['?audience=school', 'school'],
    ['?audience=training', 'training'],
    ['?audience=student', 'student'],
    ['?utm_source=x&utm_medium=paid_social&utm_campaign=student_demo_test&utm_content=demo15_search', 'student'],
  ])('classifies provider and historic visits: %s', (search, expected) => {
    expect(getLandingAudience(search)).toBe(expected);
  });

  it('ignores unknown audience parameters', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://videoq.jp/?audience=arbitrary') });
    expect(getLandingAudience()).toBe('general');
  });
});
