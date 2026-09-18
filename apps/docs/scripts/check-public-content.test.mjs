import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {checkBuild, checkSources, inspectText, validateManifest} from './check-public-content.mjs';

test('rejects account identifiers and credentials without returning their values', () => {
  for (const value of [
    `acct_${'A'.repeat(16)}`, `sk_live_${'B'.repeat(24)}`, `rk_test_${'C'.repeat(24)}`,
    `whsec_${'D'.repeat(24)}`, `sk-proj-${'E'.repeat(30)}`, `ghp_${'F'.repeat(36)}`,
    `AKIA${'G'.repeat(16)}`, '-----BEGIN PRIVATE KEY-----',
    'operator@company.invalid', 'postgresql://user:secret@production.invalid/database',
  ]) {
    const findings = inspectText(`Example\n${value}`);
    assert.ok(findings.length > 0);
    assert.equal(findings[0].line, 2);
    assert.ok(!JSON.stringify(findings).includes(value));
  }
});

test('allows configuration names, generic dashboard links and local examples', () => {
  assert.deepEqual(inspectText([
    'STRIPE_SECRET_KEY BETTER_AUTH_SECRET OPENAI_API_KEY=your-development-key',
    'https://dashboard.stripe.com/settings/public',
    'developer@example.com',
    'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
  ].join('\n')), []);
});

test('manifest accepts only exact paths, never wildcard or traversing entries', () => {
  for (const entry of ['**/*.md', '../private.md', '/private.md', './README.md', 'guide.mdx', 'a//b.md']) {
    assert.throws(() => validateManifest({documents: [entry], staticAssets: []}));
  }
  assert.throws(() => validateManifest({documents: ['README.md', 'README.md'], staticAssets: []}));
  assert.throws(() => validateManifest({documents: [], staticAssets: []}));
});

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'videoq-public-content-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const root = path.join(directory, 'apps/docs');
  const write = (relative, content) => {
    const file = path.resolve(root, relative);
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, content);
  };
  write('public-content.json', JSON.stringify({documents: ['README.md'], staticAssets: ['img/favicon.ico']}));
  write('../../docs/README.md', '# Public guide');
  write('i18n/ja/docusaurus-plugin-content-docs/current/README.md', '# 公開ガイド');
  write('static/img/favicon.ico', 'test icon');
  for (const locale of ['', 'ja/']) {
    write(`build/${locale}index.html`, '<h1>Public guide</h1>');
    write(`build/${locale}search-index-test.json`, '[]');
  }
  return {root, write};
}

test('source and artifact checks accept both sanitized languages', t => {
  const {root} = fixture(t);
  assert.doesNotThrow(() => checkSources(root));
  assert.doesNotThrow(() => checkBuild(root));
});

test('requires the Japanese source rather than silently falling back to English', t => {
  const {root} = fixture(t);
  rmSync(path.join(root, 'i18n/ja/docusaurus-plugin-content-docs/current/README.md'));
  assert.throws(() => checkSources(root), /Missing approved document/);
});

test('rejects new static downloads unless explicitly approved', t => {
  const {root, write} = fixture(t);
  write('static/operations.csv', 'customer,balance');
  assert.throws(() => checkSources(root), /Unapproved static asset/);
});

test('also scans excluded source files because the repository is public', t => {
  const {root, write} = fixture(t);
  write('../../docs/unlisted.md', `Account: acct_${'A'.repeat(16)}`);
  assert.throws(() => checkSources(root), /Stripe account identifier/);
});

for (const file of ['index.html', 'assets/js/old.js', 'ja/search-index-old.json', 'sitemap.xml']) {
  test(`rejects sensitive data in generated ${file}`, t => {
    const {root, write} = fixture(t);
    write(`build/${file}`, `Account: acct_${'A'.repeat(16)}`);
    assert.throws(() => checkBuild(root), /Stripe account identifier/);
  });
}

test('rejects an unapproved or stale generated page', t => {
  const {root, write} = fixture(t);
  write('build/internal/index.html', '<h1>Internal</h1>');
  assert.throws(() => checkBuild(root), /Unapproved generated page/);
});

test('refuses to deploy without both language builds and search indexes', t => {
  const {root} = fixture(t);
  rmSync(path.join(root, 'build/ja/search-index-test.json'));
  assert.throws(() => checkBuild(root), /Missing search index/);
});
