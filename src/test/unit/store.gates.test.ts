import * as assert from 'assert';
import { makeStore } from './helpers';

const STAMP = '2026-01-01T00:00:00.000Z';

function gatedConfig(): string {
  return JSON.stringify({
    name: 'B',
    columns: [
      { id: 'todo', name: 'To Do', color: '#000000' },
      {
        id: 'review',
        name: 'Review',
        color: '#000000',
        enter: [{ id: 'g', kind: 'field', field: 'estimate', nonEmpty: true }],
      },
    ],
    labels: {},
    agents: {},
    fields: [{ id: 'estimate', type: 'number' }],
  });
}

suite('store.evaluateMove', () => {
  function seed(): ReturnType<typeof makeStore> {
    return makeStore({
      'boards/b/.config.json': gatedConfig(),
      'boards/b/01-card.md': '---\ncolumn: todo\n---\n# Card\n',
    });
  }

  test('evaluates the target enter gate against the card', () => {
    const { store } = seed();
    const before = store.evaluateMove('b', 'card', 'review');
    assert.strictEqual(before.length, 1);
    assert.strictEqual(before[0].satisfied, false);
    assert.strictEqual(before[0].reason, 'estimate is empty');

    store.setCardField('b', 'card', 'estimate', 3);
    const after = store.evaluateMove('b', 'card', 'review');
    assert.strictEqual(after[0].satisfied, true);
  });

  test('a same-column move has no gates', () => {
    const { store } = seed();
    assert.deepStrictEqual(store.evaluateMove('b', 'card', 'todo'), []);
  });

  test('unknown card or column yields no gates', () => {
    const { store } = seed();
    assert.deepStrictEqual(store.evaluateMove('b', 'ghost', 'review'), []);
    assert.deepStrictEqual(store.evaluateMove('b', 'card', 'nope'), []);
  });
});

suite('store.recordGateApproval / recordGateOverride', () => {
  function seed(body: string): ReturnType<typeof makeStore> {
    return makeStore({
      'boards/b/.config.json': JSON.stringify({
        name: 'B',
        columns: [{ id: 'todo', name: 'To Do', color: '#000000' }],
        labels: {},
        agents: {},
        fields: [],
      }),
      'boards/b/01-card.md': `---\ncolumn: todo\n---\n${body}`,
    });
  }

  test('creates a ## Gates section when the card has none', () => {
    const { fs, store } = seed('# Card\n');
    store.recordGateApproval('b', 'card', 'signoff', 'jonathan');
    assert.strictEqual(
      fs.readFile('boards/b/01-card.md'),
      `---\ncolumn: todo\nupdatedAt: ${STAMP}\n---\n` +
        `# Card\n\n## Gates\n\n- [x] signoff — approved (jonathan, ${STAMP})\n`,
    );
  });

  test('upserts the gate line in place rather than duplicating it', () => {
    const { fs, store } = seed('# Card\n');
    store.recordGateApproval('b', 'card', 'signoff', 'jonathan');
    store.recordGateOverride('b', 'card', 'signoff', 'jonathan');
    const content = fs.readFile('boards/b/01-card.md')!;
    assert.strictEqual((content.match(/- \[x\] signoff/g) ?? []).length, 1);
    assert.ok(content.includes(`- [x] signoff — OVERRIDDEN (jonathan, ${STAMP})`));
  });

  test('appends into an existing section, preserving every other byte', () => {
    const body =
      '# Card\n\nDesc.\n\n## Gates\n\n- [x] ci — ran\n\n## Checklist\n\n- [ ] a\n';
    const { fs, store } = seed(body);
    store.recordGateApproval('b', 'card', 'signoff', 'jonathan');
    assert.strictEqual(
      fs.readFile('boards/b/01-card.md'),
      `---\ncolumn: todo\nupdatedAt: ${STAMP}\n---\n` +
        '# Card\n\nDesc.\n\n## Gates\n\n- [x] ci — ran\n' +
        `- [x] signoff — approved (jonathan, ${STAMP})\n\n` +
        '## Checklist\n\n- [ ] a\n',
    );
  });

  test('an unknown card is a silent no-op', () => {
    const { fs, store } = seed('# Card\n');
    const before = fs.snapshot();
    store.recordGateApproval('b', 'ghost', 'signoff', 'jonathan');
    assert.deepStrictEqual(fs.snapshot(), before);
  });
});
