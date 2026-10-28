const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('./dependency-automation.cjs');

const REPOSITORY = 'videoq-jp/videoq';
const SHA = 'a'.repeat(40);
function pull() {
  return { number: 123, state: 'open', draft: false, user: { login: 'dependabot[bot]' }, labels: [],
    head: { ref: 'dependabot/npm_and_yarn/npm-patch-123', sha: SHA, repo: { full_name: REPOSITORY } },
    base: { ref: 'main', repo: { full_name: REPOSITORY } } };
}
const files = () => ['package.json', 'package-lock.json'].map(filename => ({ filename, status: 'modified' }));

test('only same-repository Dependabot manifest updates are eligible', () => {
  assert.equal(policy.eligiblePull(pull(), files(), 'no-automerge'), true);
  for (const change of [
    pr => { pr.state = 'closed'; }, pr => { pr.draft = true; },
    pr => { pr.user.login = 'someone'; }, pr => { pr.head.repo.full_name = 'fork/videoq'; },
    pr => { pr.base.ref = 'develop'; }, pr => { pr.head.ref = 'codex/repair'; },
    pr => { pr.head.sha = 'main'; }, pr => { pr.labels.push({ name: 'no-automerge' }); },
  ]) {
    const pr = pull(); change(pr);
    assert.equal(policy.eligiblePull(pr, files(), 'no-automerge'), false);
  }
  for (const filename of ['infra/main.tf', 'apps/web/src/index.ts']) {
    assert.equal(policy.eligiblePull(pull(), [...files(), { filename, status: 'modified' }], 'no-automerge'), false);
  }
  for (const status of ['added', 'removed', 'renamed']) {
    assert.equal(policy.eligiblePull(pull(), [{ filename: 'package.json', status }], 'no-automerge'), false);
  }
  assert.equal(policy.eligiblePull(pull(), [], 'no-automerge'), false);
});

test('opt-out labels independently control repair and merge', () => {
  const pr = pull(); pr.labels.push({ name: 'no-codex' });
  assert.equal(policy.eligiblePull(pr, files(), 'no-codex'), false);
  assert.equal(policy.eligiblePull(pr, files(), 'no-automerge'), true);
});


test('auto-merge fails closed if required CI or strict protection disappears', () => {
  const protection = { required_status_checks: { strict: true, checks: [{ context: 'CI Success', app_id: 15368 }, { context: 'Supply Chain Security', app_id: 15368 }] } };
  policy.requireProtection(protection);
  for (const value of [{}, { required_status_checks: { strict: false, checks: protection.required_status_checks.checks } },
    { required_status_checks: { strict: true, checks: [{ context: 'CI Success', app_id: 999 }] } }]) {
    assert.throws(() => policy.requireProtection(value));
  }
});

test('historical automated repair notices do not veto newly verified automatic updates', () => {
  const notice = { user: { login: 'github-actions[bot]' }, body: '<!-- videoq-codex-repair-request -->' };
  assert.equal(policy.eligiblePull(pull(), files(), 'no-automerge', [notice]), true);
  assert.equal(policy.eligiblePull(pull(), files(), 'no-automerge', [{ ...notice, user: { login: 'someone' } }]), true);
});
