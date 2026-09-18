const { test } = require('node:test');
const assert = require('node:assert/strict');
const check = require('./cloudflare-token-expiry.cjs');
const realConfig = require('../cloudflare-token-expiry.json');
const BOT = 'github-actions[bot]';

function fixture(date = '2026-11-17') {
  const config = structuredClone(realConfig);
  // Keep tests deterministic after the production expiry is renewed.
  for (const entry of config.credentials) entry.expiresOn = '2026-12-17';
  const issues = [], comments = [], mutations = [], failures = [], summaries = [];
  const api = {
    listForRepo: async () => [...issues],
    listComments: async ({ issue_number }) => comments.filter(c => c.issue_number === issue_number),
    create: async args => {
      const issue = { ...args, number: issues.length + 1, state: 'open', user: { login: BOT }, html_url: 'https://github.com/example/1' };
      issues.push(issue); mutations.push(['create', args]); return { data: issue };
    },
    update: async args => {
      Object.assign(issues.find(i => i.number === args.issue_number), args);
      mutations.push(['update', args]);
    },
    createComment: async args => { comments.push({ ...args, user: { login: BOT } }); mutations.push(['comment', args]); },
  };
  const github = { rest: { issues: api }, paginate: async (method, args) => method(args) };
  const context = { repo: { owner: 'yukiharada1228', repo: 'videoq' }, ref: 'refs/heads/main', eventName: 'schedule' };
  const core = {
    warning() {}, setFailed: value => failures.push(value),
    summary: { addRaw(value) { summaries.push(value); return this; }, async write() {} },
  };
  return { github, context, core, config, now: new Date(`${date}T23:59:59Z`), issues, comments, mutations, failures, summaries };
}

test('the real metadata is valid without reading credentials', () => check.validateConfig(realConfig));

for (const [days, stage] of [[31, null], [30, '30-days'], [29, '30-days'], [15, '30-days'], [14, '14-days'], [8, '14-days'], [7, '7-days'], [2, '7-days'], [1, '1-day'], [0, 'expired'], [-1, 'expired']]) {
  test(`expiry stage catches up at ${days} days`, () => assert.equal(check.stageFor(days), stage));
}

test('healthy check has no writes or failure', async () => {
  const f = fixture('2026-11-16');
  await check(f);
  assert.equal(f.mutations.length, 0);
  assert.equal(f.failures.length, 0);
  assert.match(f.summaries[0], /31 days remaining/);
});

test('30-day reminder groups both tokens in one assigned issue and deduplicates reruns', async () => {
  const f = fixture();
  await check(f); await check(f);
  assert.deepEqual(f.mutations.map(m => m[0]), ['create']);
  assert.deepEqual(f.issues[0].assignees, ['yukiharada1228']);
  for (const entry of f.config.credentials) assert.ok(f.issues[0].body.includes(entry.name));
});

test('milestones notify once, including catch-up after a missed scheduled day', async () => {
  const f = fixture();
  await check(f);
  for (const day of ['2026-12-04', '2026-12-11', '2026-12-16', '2026-12-18']) {
    f.now = new Date(`${day}T09:00:00Z`);
    await check(f); await check(f);
  }
  assert.equal(f.issues.length, 1);
  assert.equal(f.comments.length, 4);
  assert.ok(f.comments.every(c => c.body.includes('@yukiharada1228')));
  assert.equal(f.failures.length, 6);
});

test('closing the issue without changing the expiry cannot silence monitoring', async () => {
  const f = fixture(); await check(f);
  f.issues[0].state = 'closed'; await check(f);
  assert.equal(f.issues[0].state, 'open');
  assert.equal(f.issues.length, 1);
});

test('only bot-authored comments can suppress the next reminder', async () => {
  const f = fixture(); await check(f);
  f.comments.push({ issue_number: 1, user: { login: 'someone' }, body: '<!-- notified:7-days -->' });
  f.now = new Date('2026-12-10T00:00:00Z'); await check(f);
  assert.equal(f.comments.length, 2);
  assert.equal(f.failures.length, 1);
});

test('user-created lookalike issues are never updated or trusted', async () => {
  const f = fixture();
  f.issues.push({ number: 1, state: 'open', user: { login: 'someone' }, body: '<!-- videoq-token-expiry:2026-12-17 -->' });
  await check(f);
  assert.equal(f.issues.length, 2);
  assert.deepEqual(f.mutations.map(m => m[0]), ['create']);
});

test('updating all expiry metadata closes only the superseded bot issue', async () => {
  const f = fixture(); await check(f);
  for (const entry of f.config.credentials) entry.expiresOn = '2027-03-01';
  await check(f);
  assert.equal(f.issues[0].state, 'closed');
});

test('renewing just one token does not close the outstanding expiry', async () => {
  const f = fixture(); await check(f);
  f.config.credentials[0].expiresOn = '2027-03-01';
  await check(f);
  assert.equal(f.issues[0].state, 'open');
});

test('dry-run can simulate expiry but never writes or fails as an expiry alert', async () => {
  const f = fixture(); f.dryRun = true; f.previewDate = '2026-12-18';
  const result = await check(f);
  assert.equal(result.urgent, true);
  assert.equal(f.mutations.length, 0);
  assert.equal(f.failures.length, 0);
  assert.match(f.summaries[0], /dry run/);
});

test('date overrides cannot generate real false-positive alerts', async () => {
  const f = fixture(); f.previewDate = '2026-12-18';
  await assert.rejects(check(f), /requires dry_run/);
  assert.equal(f.mutations.length, 0);
});

for (const [name, change] of [
  ['invalid date', f => { f.config.credentials[0].expiresOn = '2026-02-30'; }],
  ['missing expiry', f => { delete f.config.credentials[0].expiresOn; }],
  ['empty tracking', f => { f.config.credentials = []; }],
  ['duplicate ID', f => { f.config.credentials.push(f.config.credentials[0]); }],
  ['untrusted assignee text', f => { f.config.assignee = 'someone @everyone'; }],
  ['fork', f => { f.context.repo.owner = 'fork'; }],
  ['feature branch', f => { f.context.ref = 'refs/heads/feature'; }],
  ['tag named main', f => { f.context.ref = 'refs/tags/main'; }],
  ['PR event', f => { f.context.eventName = 'pull_request'; }],
]) {
  test(`rejects ${name} before writing any notification`, async () => {
    const f = fixture(); change(f);
    await assert.rejects(check(f));
    assert.equal(f.mutations.length, 0);
  });
}

test('GitHub API failure fails the monitor instead of reporting healthy', async () => {
  const f = fixture(); f.github.paginate = async () => { throw new Error('API unavailable'); };
  await assert.rejects(check(f), /API unavailable/);
});
