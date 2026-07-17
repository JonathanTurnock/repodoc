import * as assert from 'assert';
import { numPrefix, pad, slugify, stripNumPrefix, titleCase } from '../../core/naming';

suite('naming.slugify', () => {
  test('lowercases and hyphenates spaces', () => {
    assert.strictEqual(slugify('Hello World'), 'hello-world');
  });

  test('collapses runs of symbols and trims leading/trailing hyphens', () => {
    assert.strictEqual(slugify('  Use PostgreSQL!! (primary) '), 'use-postgresql-primary');
  });

  test('mixed case and punctuation', () => {
    assert.strictEqual(slugify('Fix: the/Bug #42'), 'fix-the-bug-42');
  });

  test('emoji-only falls back to the default', () => {
    assert.strictEqual(slugify('🚀🔥'), 'untitled');
  });

  test('emoji-only respects a custom fallback', () => {
    assert.strictEqual(slugify('🚀', 'card'), 'card');
  });

  test('already-slug input is unchanged', () => {
    assert.strictEqual(slugify('already-a-slug'), 'already-a-slug');
  });
});

suite('naming.stripNumPrefix', () => {
  test('strips a leading NN- prefix', () => {
    assert.strictEqual(stripNumPrefix('03-intro'), 'intro');
  });

  test('leaves un-prefixed names alone', () => {
    assert.strictEqual(stripNumPrefix('intro'), 'intro');
  });

  test('only strips the first numeric prefix', () => {
    assert.strictEqual(stripNumPrefix('01-02-thing'), '02-thing');
  });
});

suite('naming.numPrefix', () => {
  test('returns the numeric prefix as a number', () => {
    assert.strictEqual(numPrefix('07-slug.md'), 7);
  });

  test('returns undefined without a prefix', () => {
    assert.strictEqual(numPrefix('slug.md'), undefined);
  });

  test('needs the trailing hyphen to count as a prefix', () => {
    assert.strictEqual(numPrefix('12abc'), undefined);
  });
});

suite('naming.pad', () => {
  test('pads to the requested width', () => {
    assert.strictEqual(pad(3, 2), '03');
  });

  test('does not truncate numbers wider than the pad width', () => {
    assert.strictEqual(pad(123, 2), '123');
  });

  test('width of 3 pads single digits', () => {
    assert.strictEqual(pad(4, 3), '004');
  });
});

suite('naming.titleCase', () => {
  test('turns a slug into Title Case', () => {
    assert.strictEqual(titleCase('project-backlog'), 'Project Backlog');
  });

  test('collapses whitespace and capitalizes each word', () => {
    assert.strictEqual(titleCase('  getting   started '), 'Getting Started');
  });

  test('empty string stays empty', () => {
    assert.strictEqual(titleCase(''), '');
  });
});
