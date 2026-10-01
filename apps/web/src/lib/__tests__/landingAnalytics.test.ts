import { getLandingAudience, startLandingVisit, trackLandingEvent } from '../landingAnalytics';

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
    expect(JSON.parse(init.body)).toEqual({ event: 'signup_click', placement: 'hero', audience: 'training', locale: 'ja' });
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(JSON.stringify(send.mock.calls)).not.toContain('private-value');
  });

  it('does not attribute unrelated account activity to the LP', () => {
    trackLandingEvent('email_signup_created');
    trackLandingEvent('first_answer');
    expect(send).not.toHaveBeenCalled();
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
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves the product usable when storage or the network is unavailable', () => {
    send.mockRejectedValueOnce(new Error('Offline'));
    expect(() => startLandingVisit()).not.toThrow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(() => trackLandingEvent('demo_question')).not.toThrow();
  });

  it('ignores unknown audience parameters', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL('https://videoq.jp/?audience=arbitrary') });
    expect(getLandingAudience()).toBe('student');
  });
});
