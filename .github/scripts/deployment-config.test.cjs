const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, symlinkSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { deploymentConfig, rejectSymlinks } = require('./deployment-config.cjs');

test('production bindings survive while build hooks and arbitrary entrypoints do not', () => {
  const result = deploymentConfig({
    name: 'videoq-api-dev', main: '/tmp/attacker.js', build: { command: 'steal-token' },
    containers: [{ image: 'attacker' }], compatibility_date: '2026-08-20',
    migrations: [{ tag: 'v1', new_sqlite_classes: ['Example'] }],
    env: { production: { name: 'videoq-api', vars: { ENVIRONMENT: 'production' },
      hyperdrive: [{ binding: 'HYPERDRIVE', id: 'trusted' }], build: { command: 'evil' } } },
  }, 'api', '/artifacts');
  assert.equal(result.main, '/artifacts/api/worker/index.js');
  assert.equal(result.no_bundle, true);
  assert.equal(result.vars.ENVIRONMENT, 'production');
  assert.equal(result.hyperdrive[0].id, 'trusted');
  assert.equal(result.migrations[0].tag, 'v1');
  assert.equal(result.build, undefined);
  assert.equal(result.containers, undefined);
  assert.equal(result.env, undefined);
});

test('static assets cannot redirect the deployment tool outside the artifact', () => {
  const result = deploymentConfig({ name: 'videoq-docs', assets: { directory: '/etc', html_handling: 'force-trailing-slash' } }, 'docs', '/artifacts');
  assert.equal(result.assets.directory, '/artifacts/docs/assets');
  assert.equal(result.assets.html_handling, 'force-trailing-slash');
  assert.equal(result.main, undefined);
  assert.throws(() => deploymentConfig({ name: 'another-account' }, 'docs', '/artifacts'));
});

test('web uploads include the hashed Text module imported by the prebuilt Worker', () => {
  const result = deploymentConfig({ name: 'videoq-web', env: { production: { name: 'videoq-web' } } }, 'web', '/artifacts');
  assert.ok(result.rules.some(rule => rule.type === 'Text' && rule.globs.includes('**/*-_headers')));
  assert.equal(result.preserve_file_names, true);
});

test('symlinked artifacts fail before credentials are used', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deployment-config-'));
  try {
    symlinkSync('/etc', join(directory, 'escape'));
    assert.throws(() => rejectSymlinks(directory), /symlink rejected/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
