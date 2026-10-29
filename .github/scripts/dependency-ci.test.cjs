const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const workflow = name => readFileSync(join(__dirname, '../workflows', name), 'utf8');
function job(source, id) { return source.split(`\n  ${id}:\n`)[1].split(/\n  [a-z][a-z-]*:\n/)[0]; }
test('PR and native merge-group CI use real required checks without legacy admission or waiting states', () => {
  for (const [file, id, name] of [['ci.yml', 'supply-chain', 'Supply Chain Security'], ['ci.yml', 'ci-success', 'CI Success'],
    ['ci.yml', 'container-result', 'Container Validation'], ['ci.yml', 'terraform-result', 'Terraform Plan']]) {
    assert.match(workflow(file), /  merge_group:/);
    assert.match(job(workflow(file), id), new RegExp('    name: '+name+'\\n'));
    assert.doesNotMatch(workflow(file), /needs\.queue|dependency-ci-admission|Dependency Waiting/);
  }
});
test('the actual aggregate script rejects missing security checks and failed selected jobs', () => {
  const script = job(workflow('ci.yml'), 'ci-success').split("          node <<'NODE'\n")[1].split('\n          NODE')[0]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const initial = { changes: { result: 'success', outputs: { onprem: 'false' } }, 'supply-chain': { result: 'success' },
    'workflow-security': { result: 'success' }, 'frontend-test': { result: 'skipped' } };
  for (const [name, result] of [[null, null], ['supply-chain', 'skipped'], ['workflow-security', 'failure'], ['frontend-test', 'cancelled']]) {
    const jobs = structuredClone(initial); if (name) jobs[name].result = result;
    const run = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, JOB_RESULTS: JSON.stringify(jobs) } });
    assert.equal(run.status, name ? 1 : 0);
  }
});
test('the sole native controller cannot create synthetic check results or fall back to a custom queue', () => {
  assert.doesNotMatch(workflow('dependency-queue.yml'), /checks: write|QUEUE_MODE|QUEUE_ISSUE/);
  assert.match(workflow('dependency-queue.yml'), /require\('\.\/\.github\/scripts\/native-dependency-queue\.cjs'\)/);
});

test('required container and Terraform wrappers reject skipped or failed selected components', () => {
  for (const id of ['container-result', 'terraform-result']) {
    const script = job(workflow('ci.yml'), id).split('        run: |\n')[1].trim().split('\n').map(line => line.replace(/^          /, '')).join('\n');
    for (const [selected, result, expected] of [['false', 'skipped', 0], ['true', 'success', 0], ['true', 'skipped', 1], ['true', 'failure', 1], ['true', 'cancelled', 1]]) {
      const run = spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, CHANGES_RESULT: 'success', SELECTED: selected, RESULT: result } });
      assert.equal(run.status, expected, id+' '+selected+' '+result);
    }
  }
});
test('container and Terraform validation are internal CI components without duplicate PR triggers', () => {
  for (const file of ['container-validation.yml', 'terraform-plan.yml', 'onprem-validation.yml', 'local-inference-basic.yml']) {
    assert.match(workflow(file), /  workflow_call:/);
    assert.doesNotMatch(workflow(file), /  (?:pull_request|merge_group|push|workflow_dispatch):/);
    assert.match(workflow('ci.yml'), new RegExp('uses: \\./\\.github/workflows/'+file.replace('.', '\\.')));
  }
});
