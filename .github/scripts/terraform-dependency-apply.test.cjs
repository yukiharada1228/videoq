const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { automaticTerraformApply, verifiedUpdateTypes } = require('./terraform-dependency-apply.cjs');
const SHA = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const repository = 'videoq-jp/videoq';
const message = '\n---\nupdated-dependencies:\n- dependency-name: hashicorp/aws\n  update-type: version-update:semver-minor\n...\n';

function fixture() {
  const pr = {
    number: 1, state: 'closed', merged_at: '2026-10-22', merge_commit_sha: SHA,
    draft: false, user: { login: 'dependabot[bot]' }, labels: [],
    head: { ref: 'dependabot/terraform/infra/providers', sha: HEAD, repo: { full_name: repository } },
    base: { ref: 'main', repo: { full_name: repository } },
  };
  const f = {
    context: { eventName: 'push', ref: 'refs/heads/main', sha: SHA, repo: { owner: 'videoq-jp', repo: 'videoq' } },
    pr, associated: [pr], comments: [],
    files: [{ filename: 'infra/.terraform.lock.hcl', status: 'modified' }],
    commits: [{ sha: HEAD, author: { login: 'dependabot[bot]' }, commit: { message, verification: { verified: true } } }],
  };
  f.github = { rest: {
    repos: { listPullRequestsAssociatedWithCommit: async () => f.associated },
    pulls: { get: async () => ({ data: f.pr }), listFiles: async () => f.files, listCommits: async () => f.commits },
    issues: { listComments: async () => f.comments },
  }, paginate: (method, args) => method(args) };
  return f;
}

test('only merged, signed Terraform minor/patch updates allow unattended production apply', async () => {
  assert.equal(await automaticTerraformApply(fixture()), true);
  const f = fixture();
  f.commits[0].commit.message = message.replace('semver-minor', 'semver-patch');
  assert.equal(await automaticTerraformApply(f), true);
});

for (const [name, change] of [
  ['manual execution', f => { f.context.eventName = 'workflow_dispatch'; }],
  ['tag', f => { f.context.ref = 'refs/tags/main'; }],
  ['different repo', f => { f.context.repo.repo = 'other'; }],
  ['no associated PR', f => { f.associated = []; }],
  ['ambiguous merge', f => { f.associated = [f.pr, f.pr]; }],
  ['unmerged PR', f => { f.pr.merged_at = null; }],
  ['different merge SHA', f => { f.pr.merge_commit_sha = HEAD; }],
  ['non-Terraform branch', f => { f.pr.head.ref = 'dependabot/npm_and_yarn/deps'; }],
  ['human author', f => { f.pr.user.login = 'owner'; }],
  ['fork', f => { f.pr.head.repo.full_name = 'fork/videoq'; }],
  ['opt-out', f => { f.pr.labels.push({ name: 'no-automerge' }); }],
  ['source edit', f => { f.files.push({ filename: 'infra/iam.tf', status: 'modified' }); }],
  ['added lockfile', f => { f.files[0].status = 'added'; }],
  ['major update', f => { f.commits[0].commit.message = message.replace('semver-minor', 'semver-major'); }],
  ['unsigned commit', f => { f.commits[0].commit.verification.verified = false; }],
  ['human commit', f => { f.commits[0].author.login = 'owner'; }],
  ['missing metadata', f => { f.commits[0].commit.message = 'bump terraform'; }],
  ['missing dependency type', f => { f.commits[0].commit.message = message.replace('  update-type: version-update:semver-minor\n', ''); }],
  ['empty commits', f => { f.commits = []; }],
  ['stale PR head', f => { f.pr.head.sha = 'c'.repeat(40); }],
  ['human follow-up', f => { f.commits.push({ sha: HEAD, author: { login: 'owner' } }); }],
]) {
  test('approval remains required for ' + name, async () => {
    const f = fixture(); change(f);
    assert.equal(await automaticTerraformApply(f), false);
  });
}

test('a grouped major update cannot hide behind a minor update', async () => {
  const f = fixture();
  f.commits[0].commit.message = message.replace('\n...', '\n- dependency-name: other/provider\n  update-type: version-update:semver-major\n...');
  assert.deepEqual(verifiedUpdateTypes(f.commits[0]), ['version-update:semver-minor', 'version-update:semver-major']);
  assert.equal(await automaticTerraformApply(f), false);
});

test('API failures stop classification instead of granting automatic apply', async () => {
  const f = fixture();
  f.github.rest.pulls.get = async () => { throw new Error('unavailable'); };
  await assert.rejects(automaticTerraformApply(f), /unavailable/);
});

test('manual and automatic jobs keep mutually exclusive approval paths', () => {
  const workflow = readFileSync(join(__dirname, '../workflows/terraform-apply.yml'), 'utf8');
  const manual = workflow.split('\n  terraform-apply:\n')[1].split('\n  terraform-dependency-apply:\n')[0];
  const automatic = workflow.split('\n  terraform-dependency-apply:\n')[1];
  assert.match(manual, /environment: production-infra/);
  assert.match(manual, /automatic != 'true'/);
  assert.match(automatic, /automatic == 'true'/);
  assert.doesNotMatch(automatic, /environment:/);
  const scope = workflow.split('\n  terraform-apply:\n')[0];
  assert.doesNotMatch(scope, /id-token: write|AWS_GITHUB_ACTIONS_DEPLOY_ROLE_ARN/);
  assert.match(scope, /TERRAFORM_DEPENDENCY_AUTOAPPLY_ENABLED/);
});

test('unclassified signed security updates never grant unattended Terraform production apply', async () => {
  const f = fixture();
  f.commits[0].commit.message = message.replace('  update-type: version-update:semver-minor', '  dependency-version: 6.1.2');
  assert.equal(verifiedUpdateTypes(f.commits[0]), null);
  assert.deepEqual(verifiedUpdateTypes(f.commits[0], { allowMissingTypes: true }), ['version-update:semver-major']);
  assert.equal(await automaticTerraformApply(f), false);
});
test('a duplicate type cannot conceal another dependency missing its type', () => {
  const c = { author: { login: 'dependabot[bot]' }, commit: { verification: { verified: true },
    message: message.replace('\n...', '\n  update-type: version-update:semver-patch\n- dependency-name: another/provider\n...') } };
  assert.equal(verifiedUpdateTypes(c), null);
});
