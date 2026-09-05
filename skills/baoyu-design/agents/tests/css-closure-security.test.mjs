// Regression coverage for CSS @import / manifest path traversal (upstream #16).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildModel } from '../lib/ds-core.mjs';
import { tmpdir, write, read, exists, readJson, runScript } from './helpers.mjs';

const secret = ':root { --outsideSecret: #badbad; }';

function fixture(t) {
  const base = tmpdir(t);
  const root = path.join(base, 'ds');
  write(root, 'styles.css', ':root { --inside: #123456; }');
  write(base, 'outside.css', secret);
  // A sibling whose name starts with the root's name must still be rejected.
  write(base, 'ds-private/private.css', secret);
  return { base, root };
}

function assertSafe(model, expected) {
  assert.deepEqual(model.globalCssPaths, expected);
  assert.ok(!model.tokens.some((token) => token.name === '--outsideSecret'));
}

test('CSS closure rejects direct and nested parent traversal', (t) => {
  const { root } = fixture(t);
  write(root, 'styles.css', '@import "../outside.css";\n@import "parts/nested.css";');
  write(root, 'parts/nested.css', '@import "../../ds-private/private.css";');
  assertSafe(buildModel(root), ['parts/nested.css', 'styles.css']);
});

test('CSS closure rejects absolute, URL, drive and backslash imports', (t) => {
  const { base, root } = fixture(t);
  const imports = [path.join(base, 'outside.css'), '/absolute.css', '//absolute.css',
    'file:outside.css', 'https://example.invalid/styles.css', 'C:/outside.css',
    'C:outside.css', '..\\outside.css'];
  write(root, 'absolute.css', secret);
  write(root, 'file:outside.css', secret);
  write(root, 'C:/outside.css', secret);
  write(root, 'C:outside.css', secret);
  write(root, 'styles.css', imports.map((spec) => `@import "${spec}";`).join('\n'));
  assertSafe(buildModel(root), ['styles.css']);
});

test('CSS closure rejects escaping file and directory symlinks', (t) => {
  const { base, root } = fixture(t);
  fs.symlinkSync(path.join(base, 'outside.css'), path.join(root, 'linked.css'));
  fs.symlinkSync(path.join(base, 'ds-private'), path.join(root, 'linked-dir'), 'dir');
  write(root, 'styles.css', '@import "linked.css";\n@import "linked-dir/private.css";');
  assertSafe(buildModel(root), ['styles.css']);
});

test('manifest CSS entry cannot escape the root', (t) => {
  const { base, root } = fixture(t);
  fs.unlinkSync(path.join(root, 'styles.css'));
  fs.symlinkSync(path.join(base, 'outside.css'), path.join(root, 'linked.css'));
  for (const entry of ['../outside.css', '../ds-private/private.css',
    path.join(base, 'outside.css'), 'linked.css']) {
    write(root, '_ds_manifest.json', JSON.stringify({ globalCssPaths: [entry] }));
    const model = buildModel(root);
    assertSafe(model, []);
    assert.equal(model.globalCssEntry, null);
  }
});

test('CSS closure preserves in-root parents, sibling imports, cycles and post-order', (t) => {
  const { root } = fixture(t);
  write(root, 'styles.css', '@import "parts/a.css";\n@import "parts/b.css";');
  write(root, 'parts/a.css', '@import "../shared.css";');
  write(root, 'parts/b.css', '@import "../shared.css";\n@import "../..hidden.css";');
  write(root, 'shared.css', '@import "./styles.css";\n:root { --shared: #fff; }');
  write(root, '..hidden.css', ':root { --hidden: #000; }');
  assertSafe(buildModel(root), ['shared.css', 'parts/a.css', '..hidden.css', 'parts/b.css', 'styles.css']);
});

test('CSS closure supports an in-root symlink and a symlinked project root', (t) => {
  const { base, root } = fixture(t);
  write(root, 'parts/colors.css', ':root { --linked: #fff; }');
  fs.symlinkSync('parts/colors.css', path.join(root, 'linked.css'));
  fs.symlinkSync(root, path.join(base, 'root-link'), 'dir');
  write(root, 'styles.css', '@import "linked.css";');
  assertSafe(buildModel(path.join(base, 'root-link')), ['linked.css', 'styles.css']);
});

test('CSS closure skips missing files without losing later imports', (t) => {
  const { root } = fixture(t);
  write(root, 'styles.css', '@import "missing.css";\n@import "ok.css";');
  write(root, 'ok.css', ':root { --ok: #fff; }');
  assertSafe(buildModel(root), ['ok.css', 'styles.css']);
});

test('compiler and importer do not leak out-of-root CSS into generated artifacts', (t) => {
  const { base, root } = fixture(t);
  write(root, 'styles.css', '@import "../outside.css";\n:root { --inside: #123456; }');
  const project = path.join(base, 'project');
  fs.mkdirSync(project);
  const compile = runScript('compile-design-system.mjs', [root]);
  assert.equal(compile.status, 0, compile.stderr);
  const manifest = readJson(root, '_ds_manifest.json');
  assert.deepEqual(manifest.globalCssPaths, ['styles.css']);
  assert.ok(!JSON.stringify(manifest).includes('--outsideSecret'));
  const result = runScript('import-design-system.mjs', [root, project]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!exists(project, '_ds/outside.css'));
  assert.ok(!read(project, '_ds/ds/_ds_prompt.md').includes('--outsideSecret'));
});
