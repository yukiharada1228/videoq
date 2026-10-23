const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const ci = readFileSync(join(__dirname, '../workflows/ci.yml'), 'utf8');
const onprem = readFileSync(join(__dirname, '../workflows/onprem-validation.yml'), 'utf8');
const gate = ci.match(/^  ci-success:\n([\s\S]*?)(?=^  [\w-]+:)/m)[1];
const dependencies = gate.match(/needs: \[([^\]]+)\]/)[1].split(',').map(name => name.trim());
const script = gate.match(/node <<'NODE'\n([\s\S]*?)^\s+NODE$/m)[1];

function result(selected, result) {
  const jobs = Object.fromEntries(dependencies.map(name => [name, { result: 'success' }]));
  jobs.changes.outputs = { onprem: String(selected) };
  jobs['onprem-validation'].result = result;
  let exitCode = 0;
  runInNewContext(script, {
    process: { env: { JOB_RESULTS: JSON.stringify(jobs) }, exit(code) { exitCode = code; } },
    console: { error() {} },
  }, { timeout: 100 });
  return exitCode;
}

test('the existing required CI gate includes on-prem validation', () => {
  assert.ok(dependencies.includes('onprem-validation'));
  assert.match(ci, /onprem-validation:\n[\s\S]*?uses: \.\/\.github\/workflows\/onprem-validation\.yml/);
  assert.match(onprem, /workflow_call:/);
  for (const pattern of ['charts/**', 'apps/web/**', 'apps/worker/**', 'package-lock.json', '.github/runtime-versions.json']) {
    const filter = ci.match(/^            onprem:\n([\s\S]*?)(?=^            \w+:)/m)[1];
    assert.ok(filter.includes(`'${pattern}'`), pattern);
  }
  assert.equal(result(true, 'success'), 0);
  assert.equal(result(false, 'skipped'), 0);
  for (const status of ['failure', 'cancelled', 'skipped']) {
    assert.equal(result(true, status), 1, status);
  }
});

test('all on-prem images are scanned without hiding unfixed findings', () => {
  const scans = onprem.split(/(?=      - name:)/).filter(step => step.includes('uses: aquasecurity/trivy-action@'));
  assert.equal(scans.length, 6);
  for (const component of ['api', 'worker', 'web', 'local-whisper', 'ollama', 'llamacpp']) {
    const scan = scans.find(step => step.includes(['ollama', 'llamacpp'].includes(component)
      ? 'image-ref: ${{ env.' + component.toUpperCase() + '_IMAGE }}' : `image-ref: videoq-${component}:onprem-ci`));
    assert.ok(scan, component);
    assert.match(scan, /severity: HIGH,CRITICAL/);
    assert.match(scan, /ignore-unfixed: 'false'/);
    assert.match(scan, /exit-code: '1'/);
    assert.doesNotMatch(scan, /continue-on-error: true/);
  }
});

test('untrusted image builds have no production access and retain inventories', () => {
  assert.doesNotMatch(onprem, /secrets\.|secrets: inherit|environment:|id-token: write|packages: write|contents: write/);
  assert.match(onprem, /--format cyclonedx/);
  assert.match(onprem, /for component in api worker web/);
  assert.match(onprem, /if-no-files-found: error/);
  for (const checkout of onprem.split(/(?=      - uses: actions\/checkout@)/).slice(1)) {
    assert.match(checkout, /persist-credentials: false/);
  }
});

test('the web build disables dependency lifecycle scripts', () => {
  const dockerfile = readFileSync(join(__dirname, '../../apps/web/Dockerfile'), 'utf8');
  const installs = dockerfile.match(/^RUN npm ci[^\n]*/gm);
  assert.ok(installs.length);
  for (const install of installs) assert.match(install, /--ignore-scripts/);
});
