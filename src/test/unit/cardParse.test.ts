import * as assert from 'assert';
import { findGates, parseCard } from '../../core/cardParse';
import { CustomFieldDef } from '../../core/types';

const FIELDS: CustomFieldDef[] = [
  { id: 'estimate', type: 'number' },
  { id: 'sev', type: 'select', options: ['low', 'high'] },
  { id: 'tags', type: 'multiselect' },
  { id: 'flag', type: 'boolean' },
  { id: 'due', type: 'date' },
  { id: 'note', type: 'text' },
];

function card(frontmatter: string, body = '# Card\n'): ReturnType<typeof parseCard>['card'] {
  return parseCard('01-card.md', `---\n${frontmatter}\n---\n${body}`, FIELDS).card;
}

suite('cardParse — custom field coercion', () => {
  test('coerces each type; keeps select values outside options; lifts lone multiselect string', () => {
    const c = card(
      [
        'column: todo',
        'estimate: 3',
        'sev: critical', // not in options — kept verbatim
        'tags: urgent', // lone string — becomes a one-item array
        'flag: true',
        'due: 2026-07-17',
        'note: hello',
      ].join('\n'),
    );
    assert.deepStrictEqual(c.custom, {
      estimate: 3,
      sev: 'critical',
      tags: ['urgent'],
      flag: true,
      due: '2026-07-17',
      note: 'hello',
    });
  });

  test('multiselect from an inline array keeps the string members', () => {
    const c = card('tags: [a, b, c]');
    assert.deepStrictEqual(c.custom, { tags: ['a', 'b', 'c'] });
  });

  test('wrong-typed values are dropped, leaving no custom object', () => {
    const c = card(['estimate: not-a-number', 'flag: yes', 'note: 7'].join('\n'));
    // note: 7 parses to a number, so the text field rejects it too.
    assert.strictEqual(c.custom, undefined);
  });

  test('undefined field defs adopt nothing', () => {
    const c = parseCard('01-card.md', '---\nestimate: 3\n---\n# Card\n', []).card;
    assert.strictEqual(c.custom, undefined);
  });
});

suite('cardParse — gates evidence', () => {
  const body =
    '# Card\n' +
    '\n' +
    'Desc line.\n' +
    '\n' +
    '## Gates\n' +
    '\n' +
    '- [ ] tests\n' +
    '- [x] approve — approved (jonathan, 2026-07-17)\n' +
    '- [X] lint\n' +
    '\n' +
    '## Checklist\n' +
    '\n' +
    '- [ ] first\n';

  test('parses ids, done state (incl. uppercase X), and notes', () => {
    const c = card('column: todo', body);
    assert.deepStrictEqual(c.gates, [
      { gateId: 'tests', done: false },
      { gateId: 'approve', done: true, note: 'approved (jonathan, 2026-07-17)' },
      { gateId: 'lint', done: true },
    ]);
  });

  test('description stops at ## Gates and the checklist is still parsed', () => {
    const c = card('column: todo', body);
    assert.strictEqual(c.desc, 'Desc line.');
    assert.deepStrictEqual(c.checklist, [{ text: 'first', done: false }]);
  });

  test('findGates reports the body line indices of each evidence line', () => {
    const { items, indices } = findGates(body);
    assert.strictEqual(items.length, 3);
    // Lines 6/7/8 (0-based) hold the three evidence rows.
    assert.deepStrictEqual(indices, [6, 7, 8]);
  });

  test('a card with no gates section has no gates', () => {
    const c = card('column: todo', '# Card\n\nJust text.\n');
    assert.strictEqual(c.gates, undefined);
  });
});
