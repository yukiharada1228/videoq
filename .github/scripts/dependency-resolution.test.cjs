const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const resolution = require('./dependency-resolution.cjs');
const repair = require('./claude-dependency-repair.cjs');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
const repo = 'videoq-jp/videoq';
const comment = value => ({ user: { login: 'github-actions[bot]' }, body: '<!-- videoq-claude-dependency-v1 -->\n' + JSON.stringify(value) });
const manifest = version => JSON.stringify({ dependencies: { example: version } }) + '\n';
function fixture(base = B) {
  const file = { filename: 'package.json', status: 'modified', changes: 2,
    patch: '-{"dependencies":{"example":"1"}}\n+{"dependencies":{"example":"2"}}' };
  const commit = { sha: A, parents: [{ sha: C }], author: { login: 'dependabot[bot]' }, commit: { verification: { verified: true },
    message: 'update\n---\nupdated-dependencies:\n- dependency-name: example\n  update-type: version-update:semver-major\n...\n' } };
  const f = { context: { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main', runId: 77 },
    number: 1, mode: 'conflict', baseSha: base, comments: [], mutations: [], original: [file], files: [file], commits: [commit],
    proposed: manifest('2'), main: base };
  f.pr = { number: 1, state: 'open', draft: false, mergeable: false, labels: [], user: { login: 'dependabot[bot]' },
    head: { sha: A, ref: 'dependabot/npm_and_yarn/example-2', repo: { full_name: repo } }, base: { ref: 'main', sha: base, repo: { full_name: repo } } };
  f.github = { paginate: (fn, args) => fn(args), rest: {
    pulls: { get: async () => ({ data: f.pr }), listFiles: async () => f.files, listCommits: async () => f.commits },
    issues: { listComments: async () => f.comments, createComment: async ({ body }) => { f.comments.push({ user: { login: 'github-actions[bot]' }, body }); } },
    repos: { getBranch: async () => ({ data: { commit: { sha: f.main } } }),
      compareCommits: async () => ({ data: { merge_base_commit: { sha: base } } }),
      compareCommitsWithBasehead: async ({ basehead }) => ({ data: basehead.endsWith('...' + A)
        ? { total_commits: 1, commits: [commit], files: f.original }
        : { total_commits: 2, files: f.files } }),
      getContent: async ({ ref }) => ({ data: { type: 'file', encoding: 'base64', content: Buffer.from(ref === C ? manifest('1') : ref === A ? manifest('2') : f.proposed).toString('base64') } }),
    },
    actions: { getWorkflow: async () => ({ data: { id: 43 } }), getWorkflowRun: async () => ({ data: {
      workflow_id: 43, repository: { full_name: repo }, head_repository: { full_name: repo }, head_branch: 'main', event: 'push',
    } }) },
    git: { getCommit: async () => ({ data: { parents: [{ sha: A }, { sha: base }], tree: { sha: C } } }) },
  } };
  f.writerGithub = { rest: { git: {
    getCommit: f.github.rest.git.getCommit,
    createBlob: async args => { f.mutations.push(['blob', args]); return { data: { sha: C } }; },
    createTree: async args => { f.mutations.push(['tree', args]); return { data: { sha: C } }; },
    createCommit: async args => { f.mutations.push(['commit', args]); return { data: { sha: D } }; },
    updateRef: async args => { assert.equal(repair.records(f.comments, 'published')[0].sha, D); f.mutations.push(['push', args]); },
  } } };
  return f;
}
test('conflicts require verified original updates, exact main, same repository and explicit opt-outs', async () => {
  assert.ok(await resolution.candidate(fixture()));
  for (const mutate of [f => { f.baseSha = C; }, f => { f.pr.mergeable = true; },
    f => { f.pr.head.repo.full_name = 'attacker/repo'; }, f => { f.pr.labels.push({ name: 'no-claude' }); },
    f => { f.commits[0].commit.verification.verified = false; }, f => { f.commits.push({ sha: D }); f.pr.head.sha = D; }]) {
    const f = fixture(); mutate(f); assert.equal(await resolution.candidate(f), null);
  }
});
test('conflict authorization is durable for the exact head/main pair and independent from CI failures', async () => {
  const f = fixture(); assert.equal((await repair.scope(f)).mode, 'conflict');
  assert.equal(await repair.scope(f), null);
  assert.equal(repair.attempts(f.comments, 'conflict').length, 1);
  assert.equal(repair.attempts(f.comments, 'ci').length, 0);
  f.main = C; assert.equal(await resolution.candidate(f), null);
});
test('in-flight workers block duplicate dispatch; completed failures may retry within the global per-mode budget', async () => {
  const f = fixture(); await repair.scope(f);
  f.comments.push(comment({ kind: 'worker-start', authorizationRun: '77', runId: '88', sha: A }));
  f.github.rest.actions.getWorkflowRun = async () => ({ data: { status: 'in_progress' } });
  assert.equal(await repair.mayAttempt({ ...f, comments: f.comments, head: A, mode: 'conflict', base: B }), false);
  f.github.rest.actions.getWorkflowRun = async () => ({ data: { status: 'completed' } });
  assert.equal(await repair.mayAttempt({ ...f, comments: f.comments, head: A, mode: 'conflict', base: B }), true);
  for (let index = 1; index < repair.MAX_ATTEMPTS; index++) f.comments.push(comment({ kind: 'attempt', policy: 2, mode: 'conflict', runId: String(99 + index), sha: A, base: B }));
  assert.equal(await repair.mayAttempt({ ...f, comments: f.comments, head: A, mode: 'conflict', base: B }), false);
});
test('lockfile target extraction covers transitive npm, Python and Terraform upgrades', () => {
  assert.deepEqual(resolution.lockVersions('package-lock.json', JSON.stringify({ packages: { 'node_modules/example': { version: '2.0.0' } } })), { 'node_modules/example': '2.0.0' });
  assert.deepEqual(resolution.lockVersions('apps/worker/uv.lock', 'version = 1\n[[package]]\nname = "example"\nversion = "2.0.0"\n'), { 'example==2.0.0': '2.0.0' });
  assert.deepEqual(resolution.lockVersions('infra/.terraform.lock.hcl', 'provider "registry.terraform.io/hashicorp/aws" {\n  version = "6.0.0"\n}\n'), { 'registry.terraform.io/hashicorp/aws': '6.0.0' });
});
test('conflict resolution retains requested direct dependency upgrades, including major versions', async () => {
  const f = fixture(); const proof = (await resolution.candidate(f)).proof;
  assert.equal(proof.metadata.updateType, 'version-update:semver-major');
  assert.equal(await resolution.preservedTargets({ ...f, proof, ref: D }), true);
  f.proposed = manifest('1');
  assert.equal(await resolution.preservedTargets({ ...f, proof, ref: D }), false);
});
test('large lockfile content is verified through the exact blob instead of omitted contents metadata', async () => {
  const f = fixture(); const proof = (await resolution.candidate(f)).proof; const blobs = [];
  f.github.rest.repos.getContent = async ({ ref }) => ({ data: { type: 'file', encoding: 'none', sha: ref } });
  f.github.rest.git.getBlob = async ({ file_sha }) => {
    blobs.push(file_sha); return { data: { encoding: 'base64', content: Buffer.from(file_sha === C ? manifest('1') : manifest('2')).toString('base64') } };
  };
  assert.equal(await resolution.preservedTargets({ ...f, proof, ref: D }), true);
  assert.deepEqual(blobs, [C, A, D]);
});
test('a merge receipt requires exact parents, trusted main ancestry and the original upgrade', async () => {
  const f = fixture(); f.comments.push(comment({ kind: 'published', policy: 2, mode: 'conflict',
    sha: D, parent: A, base: B, origin: A, originalBase: C, runId: '77' }));
  f.pr.head.sha = D;
  assert.ok(await resolution.provenance({ ...f, pr: f.pr, files: f.files, comments: f.comments }));
  f.proposed = manifest('1');
  assert.equal(await resolution.provenance({ ...f, pr: f.pr, files: f.files, comments: f.comments }), null);
  f.proposed = manifest('2');
  f.github.rest.git.getCommit = async () => ({ data: { parents: [{ sha: A }, { sha: C }] } });
  assert.equal(await resolution.provenance({ ...f, pr: f.pr, files: f.files, comments: f.comments }), null);
});
test('a CI compatibility patch after a resolved merge retains verifiable original update provenance', async () => {
  const f = fixture(); const E = 'e'.repeat(40);
  f.comments.push(comment({ kind: 'published', policy: 2, mode: 'conflict', sha: D, parent: A, base: B, origin: A, originalBase: C, runId: '77' }),
    comment({ kind: 'published', policy: 2, mode: 'ci', sha: E, parent: D, origin: A, originalBase: C, runId: '78' }));
  const source = { filename: 'apps/web/.storybook/vite.config.ts', status: 'modified', patch: '-old\n+new', changes: 2 };
  const original = f.github.rest.repos.compareCommitsWithBasehead;
  f.github.rest.repos.compareCommitsWithBasehead = async args => {
    if (args.basehead === `${C}...${D}`) return { data: { total_commits: 2, commits: [...f.commits, { sha: D, parents: [{ sha: A }, { sha: B }] }], files: f.files } };
    if (args.basehead === `${D}...${E}`) return { data: { total_commits: 1, files: [source] } };
    return original(args);
  };
  f.github.rest.git.getCommit = async ({ commit_sha }) => ({ data: { parents: commit_sha === E ? [{ sha: D }] : [{ sha: A }, { sha: B }] } });
  const proof = await resolution.provenance({ ...f, pr: { ...f.pr, head: { ...f.pr.head, sha: E } }, files: [...f.files, source] });
  assert.equal(proof.originalHead, A); assert.equal(proof.metadata.updateType, 'version-update:semver-major');
});
function checkout(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'videoq-conflict-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(cwd, 'package.json'), manifest('1'));
  mkdirSync(join(cwd, 'apps/web/.storybook'), { recursive: true });
  writeFileSync(join(cwd, 'apps/web/.storybook/vite.config.ts'), 'export const plugins = 1;\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'main');
  const base = git('rev-parse', 'HEAD').trim();
  return { cwd, git, base };
}
test('isolated publication applies to exact main, preserves upgrade, uses both parents and never force pushes', async t => {
  const { cwd, git, base } = checkout(t);
  writeFileSync(join(cwd, 'package.json'), manifest('2'));
  writeFileSync(join(cwd, 'apps/web/.storybook/vite.config.ts'), 'export const plugins = 2;\n');
  const patchPath = join(cwd, 'repair.patch'); writeFileSync(patchPath, git('diff')); git('restore', '.');
  const f = fixture(base); await repair.scope(f);
  await repair.claimWorker({ ...f, expectedSha: A, authorizationRun: '77' });
  await repair.publish({ ...f, expectedSha: A, authorizationRun: '77', cwd, patchPath });
  assert.deepEqual(f.mutations.find(([kind]) => kind === 'commit')[1].parents, [A, base]);
  assert.equal(f.mutations.find(([kind]) => kind === 'push')[1].force, false);
  assert.equal(repair.records(f.comments, 'published')[0].base, base);
});
test('conflict patches cannot publish automation, executable files, unresolved markers or deleted source', t => {
  const { cwd, git } = checkout(t);
  const metadata = { ecosystem: 'npm_and_yarn', updateType: 'version-update:semver-major', maintainerChanges: 'false' };
  writeFileSync(join(cwd, 'apps/web/.storybook/vite.config.ts'), '<<<<<<< HEAD\nconst plugins = 1;\n=======\nconst plugins = 2;\n>>>>>>> main\n');
  const patch = join(cwd, 'repair.patch'); writeFileSync(patch, git('diff')); git('restore', '.');
  assert.throws(() => resolution.applyPatch(cwd, patch, metadata), /Unresolved conflict/);
  git('reset', '--hard', 'HEAD');
  writeFileSync(patch, 'diff --git a/apps/web/.storybook/vite.config.ts b/apps/web/.storybook/vite.config.ts\nold mode 100644\nnew mode 100755\n');
  assert.throws(() => resolution.applyPatch(cwd, patch, metadata), /Forbidden conflict path or mode/);
  assert.equal(resolution.allowedFiles([{ filename: '.github/workflows/ci.yml', status: 'modified', patch: '-permissions: read-all\n+permissions: write-all', changes: 2 }], metadata), false);
});
