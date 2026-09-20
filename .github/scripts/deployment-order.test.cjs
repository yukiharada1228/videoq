const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const workflow = readFileSync(join(__dirname, '../workflows/cd.yml'), 'utf8');
function job(name) {
  const body = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(body, `Missing job ${name}`);
  return {
    dependencies: body.match(/^    needs: \[([^\]]+)\]/m)?.[1].split(',').map(value => value.trim()),
    condition: body.match(/^    if: \|\n((?:      .+\n)+)/m)?.[1].trim(),
  };
}

function workerCanDeploy(outputs, results = {}) {
  const needs = {
    changes: { result: 'success', outputs: { api: 'true', web: 'true', worker: 'true', ...outputs } },
    'db-migrate': { result: 'success' },
    'api-deploy': { result: 'success' },
    'web-deploy': { result: 'success' },
  };
  for (const [name, result] of Object.entries(results)) needs[name].result = result;
  const expression = job('worker-deploy').condition.replace(
    /needs\.([\w-]+)\.(?:outputs\.([\w]+)|(result))/g,
    (_, name, output) => JSON.stringify(output ? needs[name].outputs[output] : needs[name].result),
  );
  return runInNewContext(expression, { always: () => true }, { timeout: 100 });
}

test('the deployment graph schedules shared-data readers before the worker', () => {
  assert.ok(job('api-deploy').dependencies.includes('db-migrate'));
  assert.ok(job('web-deploy').dependencies.includes('api-deploy'));
  for (const dependency of ['changes', 'db-migrate', 'api-deploy', 'web-deploy']) {
    assert.ok(job('worker-deploy').dependencies.includes(dependency), `Worker must wait for ${dependency}`);
  }
});

test('coordinated deployment proceeds after migration and both readers succeed', () => {
  assert.equal(workerCanDeploy({}), true);
  assert.equal(workerCanDeploy({}, { 'db-migrate': 'skipped' }), true);
});

for (const dependency of ['changes', 'db-migrate', 'api-deploy', 'web-deploy']) {
  for (const result of ['failure', 'cancelled']) {
    test(`blocks the worker when ${dependency} reports ${result}`, () => {
      assert.equal(workerCanDeploy({}, { [dependency]: result }), false);
    });
  }
}
for (const dependency of ['api-deploy', 'web-deploy']) {
  test(`blocks the worker when selected ${dependency} was unexpectedly skipped`, () => {
    assert.equal(workerCanDeploy({}, { [dependency]: 'skipped' }), false);
  });
}
test('worker-only changes allow unchanged readers to be skipped', () => {
  assert.equal(workerCanDeploy({ api: 'false', web: 'false' }, {
    'db-migrate': 'skipped', 'api-deploy': 'skipped', 'web-deploy': 'skipped',
  }), true);
});
test('a deployment waits for whichever reader changed', () => {
  assert.equal(workerCanDeploy({ web: 'false' }, { 'web-deploy': 'skipped' }), true);
  assert.equal(workerCanDeploy({ api: 'false' }, { 'api-deploy': 'skipped' }), true);
});
test('does not deploy the worker when its files did not change', () => {
  assert.equal(workerCanDeploy({ worker: 'false' }), false);
});
