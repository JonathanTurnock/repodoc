import * as assert from 'assert';
import { makeStore } from './helpers';

const SEED = {
  'decisions/01-record.md':
    '# Decision 0001 — Record architecture decisions\n\n' +
    '**Status:** Accepted &nbsp;·&nbsp; **Date:** 2020-01-01\n\nBody.\n',
  'decisions/03-postgres.md': '# ADR-3 — Use PostgreSQL\n\n**Status:** Proposed\n\nBody.\n',
  'decisions/02-loose.md': '# A title with no ADR prefix\n\nNo status line here.\n',
};

suite('store.listDecisions', () => {
  test('parses num, strips ADR/Decision prefix from title, and sorts by number', () => {
    const { store } = makeStore(SEED);
    const decisions = store.listDecisions();
    assert.deepStrictEqual(
      decisions.map((d) => [d.num, d.title, d.status]),
      [
        ['01', 'Record architecture decisions', 'Accepted'],
        ['02', 'A title with no ADR prefix', 'Proposed'],
        ['03', 'Use PostgreSQL', 'Proposed'],
      ],
    );
  });

  test('id is the filename without extension; body is the full file', () => {
    const { store } = makeStore(SEED);
    const rec = store.listDecisions().find((d) => d.num === '01')!;
    assert.strictEqual(rec.id, '01-record');
    assert.strictEqual(rec.file, '01-record.md');
    assert.ok(rec.body.startsWith('# Decision 0001'));
  });

  test('status defaults to Proposed when no Status line is present', () => {
    const { store } = makeStore(SEED);
    assert.strictEqual(store.listDecisions().find((d) => d.num === '02')!.status, 'Proposed');
  });

  test('ignores non-.md and dot files', () => {
    const { store } = makeStore({
      'decisions/01-a.md': '# ADR-1 — A\n\n**Status:** Accepted\n',
      'decisions/notes.txt': 'ignore me',
      'decisions/.draft.md': '# Draft\n',
    });
    assert.strictEqual(store.listDecisions().length, 1);
  });
});

suite('store.getDecision', () => {
  test('returns the record matching an id', () => {
    const { store } = makeStore(SEED);
    assert.strictEqual(store.getDecision('03-postgres')!.title, 'Use PostgreSQL');
  });

  test('unknown id returns undefined', () => {
    const { store } = makeStore(SEED);
    assert.strictEqual(store.getDecision('nope'), undefined);
  });
});

suite('store.createDecision', () => {
  test('numbers sequentially after existing records with 2-pad and a title slug', () => {
    const { fs, store } = makeStore(SEED);
    const id = store.createDecision('Adopt event sourcing');
    assert.strictEqual(id, '04-adopt-event-sourcing');
    const body = fs.readFile('decisions/04-adopt-event-sourcing.md')!;
    assert.ok(body.startsWith('# Decision 04 — Adopt event sourcing\n'));
    assert.ok(body.includes('**Status:** Proposed'));
    assert.ok(body.includes('**Date:** 2026-01-01'));
    assert.ok(body.includes('## Context'));
    assert.ok(body.includes('## Decision'));
    assert.ok(body.includes('## Consequences'));
  });

  test('starts at 01 in an empty repo', () => {
    const { store } = makeStore();
    assert.strictEqual(store.createDecision('First one'), '01-first-one');
  });

  test('blank title falls back to "Untitled decision"', () => {
    const { fs, store } = makeStore();
    const id = store.createDecision('   ');
    assert.strictEqual(id, '01-untitled-decision');
    assert.ok(fs.readFile(`decisions/${id}.md`)!.includes('Untitled decision'));
  });
});
