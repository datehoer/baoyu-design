// CLI smoke tests for agents/build-preview.mjs (self-contained preview.html).
// Runs with --offline so the test never touches the network; the fixture's
// cards are static HTML, so no React/Babel inlining is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { tmpdir, read, write, exists, makeDsFixture, runScript } from './helpers.mjs';

const SCRIPT = 'build-preview.mjs';

test('usage: no args → non-zero exit', () => {
  const r = runScript(SCRIPT, []);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Usage:/);
});

test('builds one self-contained preview.html from the fixture', (t) => {
  const root = makeDsFixture(tmpdir(t));
  assert.equal(runScript('compile-design-system.mjs', [root]).status, 0);

  const out = path.join(root, 'preview.html');
  const r = runScript(SCRIPT, [root, '--out', out, '--title', 'Acme Preview', '--offline']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /wrote .*preview\.html/);

  assert.ok(exists(root, 'preview.html'));
  const html = read(root, 'preview.html');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Acme Preview'));
  assert.ok(html.includes('id="ds-data"'), 'embeds the card payload');
  assert.ok(html.includes('Buttons'), 'card title present');
  assert.ok(html.includes('Acme Design System'), 'readme rendered');
  // self-contained: the card's stylesheet is inlined, not linked relatively
  assert.ok(!html.includes('href="../styles.css"'));
});

test('preview excludes outside files through sibling paths and symlinks', (t) => {
  const base = tmpdir(t);
  const root = path.join(base, 'ds');
  const outside = path.join(base, 'ds-private');
  const marker = 'OUTSIDE_FILE_MUST_NOT_BE_BUNDLED';
  for (const file of ['outside.css', 'outside.js', 'outside.svg', 'outside.json']) {
    write(outside, file, marker);
  }
  write(outside, 'outside.html', `<!-- @dsCard group="External" name="External" --><p>${marker}</p>`);
  write(root, 'inside.svg', 'INSIDE_ASSET');
  fs.symlinkSync(outside, path.join(root, 'linked-dir'), 'dir');
  fs.symlinkSync(path.join(outside, 'outside.json'), path.join(root, 'linked.json'));
  fs.symlinkSync(path.join(outside, 'outside.html'), path.join(root, 'linked.html'));
  fs.symlinkSync(path.join(outside, 'outside.js'), path.join(root, 'README.md'));
  write(root, '_ds_manifest.json', JSON.stringify({ cards: [
    { path: 'card.html', name: 'Inside' },
    { path: '../ds-private/outside.html', name: 'Outside' },
    { path: 'linked.html', name: 'Symlink' },
  ] }));
  write(root, 'card.html', `<!-- @dsCard group="Test" name="Inside" -->
    <link rel="stylesheet" href="../ds-private/outside.css">
    <style>@import "linked-dir/outside.css";</style>
    <script src="../ds-private/outside.js"></script>
    <script src="linked-dir/outside.js"></script>
    <img src="../ds-private/outside.svg">
    <img src="linked-dir/outside.svg">
    <img src="inside.svg">
    <script>fetch('./inside.json')</script>`);
  write(root, 'inside.json', '{"allowed":true}');
  for (const useManifest of [true, false]) {
    if (!useManifest) fs.unlinkSync(path.join(root, '_ds_manifest.json'));
    const result = runScript(SCRIPT, [root, '--offline']);
    assert.equal(result.status, 0, result.stderr);
    const html = read(root, 'preview.html');
    assert.ok(!html.includes(marker), 'outside text must not be read');
    assert.ok(!html.includes(Buffer.from(marker).toString('base64')), 'outside assets must not be embedded');
    assert.ok(html.includes(Buffer.from('INSIDE_ASSET').toString('base64')), 'inside asset still works');
    assert.ok(html.includes(Buffer.from('{"allowed":true}').toString('base64')), 'inside runtime asset still works');
  }
});

test('preview preserves inline Markdown code verbatim', (t) => {
  const root = tmpdir(t);
  write(root, 'README.md', '# Example\n\nUse `a **literal** <tag>` and **bold**.');
  const result = runScript(SCRIPT, [root, '--offline']);
  assert.equal(result.status, 0, result.stderr);
  const html = read(root, 'preview.html');
  assert.ok(html.includes('<code>a **literal** &lt;tag&gt;</code>'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(!html.includes('\x00'));
});
