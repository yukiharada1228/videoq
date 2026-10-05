import { collectLandingEvent } from '../../../worker/landing-events';

const payload = { event: 'demo_source', audience: 'school', locale: 'ja', placement: 'none' };
const request = (body: string, headers: Record<string, string> = {}) => new Request('https://videoq.jp/__events/landing', {
  method: 'POST', body, headers: { Origin: 'https://videoq.jp', 'Content-Type': 'application/json', ...headers },
});

describe('landing collector', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('writes a structured event to the existing logs and never caches it', async () => {
    const response = await collectLandingEvent(request(JSON.stringify(payload)), 'production');
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(console.log).toHaveBeenCalledWith({ kind: 'landing_funnel', version: 'student-v1', ...payload });
  });

  it.each(['unattributed', 'x_paid_demo15_search', 'x_paid_teacher_qa', 'x_organic_launch', 'internal_test'])('accepts the fixed cohort %s', async acquisition => {
    const attributed = { ...payload, acquisition };
    expect((await collectLandingEvent(request(JSON.stringify(attributed)), 'production')).status).toBe(204);
    expect(console.log).toHaveBeenCalledWith({ kind: 'landing_funnel', version: 'student-v1', ...attributed });
  });

  it.each(['google_auth_started', 'google_signup_created', 'video_upload_started', 'video_upload_accepted', 'video_upload_failed'])(
    'accepts the funnel stage %s', async event => {
      const body = { ...payload, event };
      expect((await collectLandingEvent(request(JSON.stringify(body)), 'production')).status).toBe(204);
      expect(console.log).toHaveBeenCalledWith({ kind: 'landing_funnel', version: 'student-v1', ...body });
    },
  );

  it.each([
    ['unknown event', { ...payload, event: 'anything' }],
    ['extra field', { ...payload, email: 'private@example.test' }],
    ['unknown audience', { ...payload, audience: 'arbitrary' }],
    ['unknown acquisition', { ...payload, acquisition: 'private@example.test' }],
    ['extra field with acquisition', { ...payload, acquisition: 'x_paid_demo15_search', email: 'private@example.test' }],
    ['array', [payload]],
    ['null', null],
  ])('rejects %s without logging the input', async (_label, body) => {
    expect((await collectLandingEvent(request(JSON.stringify(body)), 'production')).status).toBe(400);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies even without Content-Length', async () => {
    expect((await collectLandingEvent(request(' '.repeat(513)), 'production')).status).toBe(413);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and non-JSON requests', async () => {
    expect((await collectLandingEvent(request('{}', { Origin: 'https://other.test' }), 'production')).status).toBe(403);
    expect((await collectLandingEvent(request('{}', { 'Content-Type': 'text/plain' }), 'production')).status).toBe(415);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('does not log preview or development traffic', async () => {
    expect((await collectLandingEvent(request(JSON.stringify(payload)), 'development')).status).toBe(204);
    expect(console.log).not.toHaveBeenCalled();
  });
});
