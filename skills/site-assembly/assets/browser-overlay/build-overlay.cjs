const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const [rawUrl, adapterPath, outputPath, customCssPath] = process.argv.slice(2);
if (!rawUrl || !adapterPath || !outputPath) {
  throw new Error('Usage: node build-overlay.cjs <http(s) URL> <adapter.js> <output folder> [adapter.css]');
}

const target = new URL(rawUrl);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.port || target.pathname.includes('*')) {
  throw new Error('Use a public HTTP(S) URL with a literal path and the default port.');
}

const starter = join(__dirname, '../starter');
const output = resolve(outputPath);
const tour = readFileSync(join(starter, 'agent-tour.js'), 'utf8').replace(/^export /gm, '');
const agents = readFileSync(join(starter, 'agent-build.js'), 'utf8').replace(/^import .*;\r?\n/m, '').replace(/^export /gm, '');
const adapter = readFileSync(resolve(adapterPath), 'utf8');
const css = readFileSync(join(starter, 'agent-build.css'), 'utf8');
const customCss = customCssPath ? readFileSync(resolve(customCssPath), 'utf8') : '';
const manifest = {
  manifest_version: 3,
  name: `Site Assembly · ${target.hostname}`,
  version: '1.0.0',
  description: 'A local cursor tour on the original website.',
  content_scripts: [{
    matches: [`${target.origin}${target.pathname}*`],
    js: ['overlay.js'],
    css: ['overlay.css'],
    run_at: 'document_idle',
  }],
};

mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(output, 'overlay.css'), `${css}\n${customCss}\n`);
writeFileSync(join(output, 'overlay.js'), `(() => {\n'use strict';\nif (location.origin !== ${JSON.stringify(target.origin)} || location.pathname !== ${JSON.stringify(target.pathname)}) return;\n${tour}\n${agents}\n${adapter}\n})();\n`);
