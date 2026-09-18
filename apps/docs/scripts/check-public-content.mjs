import {readdirSync, readFileSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const siteDir = fileURLToPath(new URL('../', import.meta.url));
const contentRoots = ['../../docs', 'i18n/ja/docusaurus-plugin-content-docs/current'];
const rules = [
  ['Stripe account identifier', /\bacct_[a-zA-Z0-9]{8,}\b/g],
  ['Stripe API key', /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{12,}\b/g],
  ['Stripe webhook secret', /\bwhsec_[a-zA-Z0-9]{12,}\b/g],
  ['API secret key', /\bsk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{20,}\b/g],
  ['GitHub token', /\b(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,})\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['JWT', /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g],
  ['signed URL', /(?:X-Amz-Signature|X-Goog-Signature)=[a-fA-F0-9]{32,}/gi],
];

// Report only locations and categories. Never copy a matched secret into CI logs.
export function inspectText(text) {
  const findings = [];
  const add = (kind, match) => findings.push({kind, line: text.slice(0, match.index).split('\n').length});
  for (const [kind, pattern] of rules) {
    for (const match of text.matchAll(pattern)) add(kind, match);
  }
  for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
    if (!/^(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$/i.test(match[1])) add('non-example email address', match);
  }
  for (const match of text.matchAll(/\bpostgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@([^\s/:]+)/gi)) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(match[1])) add('remote database credentials', match);
  }
  return findings;
}

function filesUnder(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in publish inputs: ${file}`);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

export function validateManifest(manifest) {
  for (const key of ['documents', 'staticAssets']) {
    const entries = manifest[key];
    if (!Array.isArray(entries) || (key === 'documents' && entries.length === 0)) {
      throw new Error(`public-content.json must contain a ${key} array`);
    }
    if (new Set(entries).size !== entries.length) throw new Error(`Duplicate ${key} entry`);
    for (const entry of entries) {
      if (typeof entry !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(entry) ||
          entry.split('/').some(part => !part || part === '.' || part === '..') ||
          (key === 'documents' && !entry.endsWith('.md'))) {
        throw new Error(`Invalid ${key} entry; use exact relative file paths, without globs`);
      }
    }
  }
}

function scanFiles(files, root) {
  const findings = files.flatMap(file => inspectText(readFileSync(file, 'utf8')).map(finding =>
    `${path.relative(root, file)}:${finding.line}: ${finding.kind}`));
  if (findings.length) throw new Error(`Public content check failed:\n${findings.join('\n')}`);
}

export function checkSources(root = siteDir) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'public-content.json'), 'utf8'));
  validateManifest(manifest);
  const sources = [];
  for (const relativeRoot of contentRoots) {
    const directory = path.resolve(root, relativeRoot);
    const files = filesUnder(directory);
    for (const document of manifest.documents) {
      if (!files.includes(path.join(directory, document))) {
        throw new Error(`Missing approved document: ${relativeRoot}/${document}`);
      }
    }
    // This repository is public: excluded documents must not contain secrets either.
    sources.push(...files);
  }
  const staticDir = path.join(root, 'static');
  const staticFiles = filesUnder(staticDir);
  for (const file of staticFiles) {
    if (!manifest.staticAssets.includes(path.relative(staticDir, file).split(path.sep).join('/'))) {
      throw new Error(`Unapproved static asset: ${path.relative(root, file)}`);
    }
  }
  for (const asset of manifest.staticAssets) {
    if (!staticFiles.includes(path.join(staticDir, asset))) throw new Error(`Missing approved static asset: ${asset}`);
  }
  scanFiles([...sources, ...staticFiles], root);
  return manifest;
}

export function checkBuild(root = siteDir) {
  const manifest = checkSources(root);
  const buildDir = path.join(root, 'build');
  // Require both locales before deployment; a partial build is not publishable.
  for (const locale of ['', 'ja/']) {
    if (!lstatSync(path.join(buildDir, locale, 'index.html')).isFile()) throw new Error('Missing locale homepage');
    if (!readdirSync(path.join(buildDir, locale)).some(file => /^search-index.*\.json$/.test(file))) {
      throw new Error(`Missing search index for ${locale || 'en'}`);
    }
  }
  const files = filesUnder(buildDir);
  scanFiles(files, root);
  // Catch stale or accidentally copied pages even when their content has no known secret pattern.
  const approvedPages = new Set(['404.html', 'ja/404.html']);
  for (const locale of ['', 'ja/']) {
    approvedPages.add(`${locale}search/index.html`);
    for (const document of manifest.documents) {
      // Docusaurus treats README.md and index.md as category index pages.
      // A new custom slug requires reviewing this route policy as well.
      const route = /(?:^|\/)(?:README|index)\.md$/.test(document)
        ? document.replace(/(?:README|index)\.md$/, '')
        : `${document.slice(0, -3)}/`;
      approvedPages.add(`${locale}${route}index.html`);
    }
  }
  for (const file of files) {
    const relative = path.relative(buildDir, file).split(path.sep).join('/');
    if (relative.endsWith('.html') && !approvedPages.has(relative)) {
      throw new Error(`Unapproved generated page: ${relative}. Review its route and public-content.json.`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'source') checkSources();
    else if (process.argv[2] === 'build') checkBuild();
    else throw new Error('Usage: node scripts/check-public-content.mjs source|build');
    console.log(`Public content ${process.argv[2]} check passed.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
