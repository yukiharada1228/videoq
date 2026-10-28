const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const workflow = name => readFileSync(join(__dirname, '../workflows', name), 'utf8');
function job(source, id) {
  return source.split(`\n  ${id}:\n`)[1].split(/\n  [a-z][a-z-]*:\n/)[0];
}
test('waiting runs never replace required checks with skipped or successful checks', () => {
  for (const [file, id, required] of [
    ['ci.yml', 'supply-chain', 'Supply Chain Security'], ['ci.yml', 'ci-success', 'CI Success'],
    ['ci.yml', 'dependency-gate', 'Dependency Queue'], ['container-validation.yml', 'result', 'Container Validation'],
  ]) {
    const block = job(workflow(file), id);
    const names = block.match(/name: \$\{\{ needs\.queue\.outputs\.run == 'true' && '([^']+)' \|\| '([^']+)' \}\}/);
    assert.ok(names, `${id} must choose a different check name before skipping a waiting run`);
    assert.equal(names[1], required);
    assert.notEqual(names[2], required);
    assert.match(names[2], /Waiting/);
  }
});
test('the actual native gate script requires successful admission and successful selected CI', () => {
  const block = job(workflow('ci.yml'), 'dependency-gate');
  const script = block.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  for (const [admission, admitted, ci, expected] of [
    ['success', 'true', 'success', 0], ['success', 'true', 'failure', 1],
    ['success', 'true', 'cancelled', 1], ['success', 'true', 'skipped', 1],
    ['failure', 'false', 'skipped', 1], ['success', 'false', 'skipped', 0],
  ]) {
    const result = spawnSync('bash', ['-ec', script], { env: { ...process.env,
      ADMISSION_RESULT: admission, ADMITTED: admitted, CI_RESULT: ci } });
    assert.equal(result.status, expected, `${admission}/${admitted}/${ci}`);
  }
});
test('the controller has no synthetic check publishing permission or API calls', () => {
  assert.doesNotMatch(workflow('dependency-queue.yml'), /checks: write/);
  assert.doesNotMatch(readFileSync(join(__dirname, 'dependency-queue.cjs'), 'utf8'), /rest\.checks\./);
});
