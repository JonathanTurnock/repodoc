import * as assert from 'assert';
import { normalizeBoardConfig, RESERVED_CARD_KEYS } from '../../core/boardConfig';

suite('boardConfig.normalizeBoardConfig — fallbacks', () => {
  test('undefined input yields a board named from the id with empty maps', () => {
    assert.deepStrictEqual(normalizeBoardConfig(undefined, 'my-board'), {
      name: 'My Board',
      columns: [],
      labels: {},
      agents: {},
      fields: [],
    });
  });

  test('non-object input (string/number/array) falls back', () => {
    for (const bad of ['nope', 42, ['a']] as unknown[]) {
      assert.deepStrictEqual(normalizeBoardConfig(bad, 'b'), {
        name: 'B',
        columns: [],
        labels: {},
        agents: {},
        fields: [],
      });
    }
  });

  test('blank/absent name falls back to the title-cased id', () => {
    assert.strictEqual(normalizeBoardConfig({ name: '   ' }, 'project-x').name, 'Project X');
    assert.strictEqual(normalizeBoardConfig({}, 'project-x').name, 'Project X');
  });
});

suite('boardConfig.normalizeBoardConfig — columns', () => {
  test('keeps only entries with a non-empty string id', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        columns: [
          { id: 'todo', name: 'To Do', color: '#000' },
          { id: '', name: 'Bad' },
          null,
          'garbage',
          { name: 'No id' },
        ],
      },
      'b',
    );
    assert.deepStrictEqual(
      config.columns.map((c) => c.id),
      ['todo'],
    );
  });
});

suite('boardConfig.normalizeBoardConfig — label/agent hygiene', () => {
  test('drops null entries inside the agents map', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        agents: {
          claude: null,
          cursor: { name: 'Cursor', color: '#4c8bf5', initials: 'CU' },
        },
      },
      'b',
    );
    assert.deepStrictEqual(Object.keys(config.agents), ['cursor']);
  });

  test('drops non-object and empty-shell entries from labels', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        labels: {
          bug: { name: 'bug', color: '#e5534b' },
          broken: 'not-an-object',
          arr: ['a', 'b'],
          empty: {},
          nostrings: { count: 3 },
        },
      },
      'b',
    );
    assert.deepStrictEqual(Object.keys(config.labels), ['bug']);
  });

  test('a whole non-object labels/agents value degrades to {}', () => {
    const config = normalizeBoardConfig({ name: 'B', labels: 'x', agents: 7 }, 'b');
    assert.deepStrictEqual(config.labels, {});
    assert.deepStrictEqual(config.agents, {});
  });
});

suite('boardConfig.normalizeBoardConfig — custom fields', () => {
  test('missing/absent fields degrades to an empty array', () => {
    assert.deepStrictEqual(normalizeBoardConfig({ name: 'B' }, 'b').fields, []);
    assert.deepStrictEqual(normalizeBoardConfig({ name: 'B', fields: 'x' }, 'b').fields, []);
  });

  test('drops non-objects, no-string-id, reserved, duplicate, and unknown-type entries', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        fields: [
          { id: 'estimate', type: 'number', label: 'Estimate' },
          { id: 'priority', type: 'text' }, // reserved key — dropped
          { id: 'estimate', type: 'text' }, // duplicate id — dropped
          { id: 'foo', type: 'bogus' }, // unknown type — dropped
          { id: '', type: 'text' }, // empty id — dropped
          { type: 'text' }, // no id — dropped
          null,
          'nope',
          { id: 'flag', type: 'boolean', showOnCard: true },
        ],
      },
      'b',
    );
    assert.deepStrictEqual(config.fields, [
      { id: 'estimate', type: 'number', label: 'Estimate' },
      { id: 'flag', type: 'boolean', showOnCard: true },
    ]);
  });

  test('select/multiselect always carry a coerced options string array', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        fields: [
          { id: 'sev', type: 'select', options: ['low', 2, 'high', null] },
          { id: 'tags', type: 'multiselect' },
        ],
      },
      'b',
    );
    assert.deepStrictEqual(config.fields, [
      { id: 'sev', type: 'select', options: ['low', 'high'] },
      { id: 'tags', type: 'multiselect', options: [] },
    ]);
  });

  test('every reserved card key is rejected as a field id', () => {
    const fields = [...RESERVED_CARD_KEYS].map((id) => ({ id, type: 'text' }));
    assert.deepStrictEqual(normalizeBoardConfig({ name: 'B', fields }, 'b').fields, []);
  });
});

suite('boardConfig.normalizeBoardConfig — column gates', () => {
  test('normalizes enter/exit gates per kind and strips unknown props', () => {
    const config = normalizeBoardConfig(
      {
        name: 'B',
        columns: [
          {
            id: 'review',
            name: 'Review',
            color: '#000',
            enter: [
              { id: 'g1', kind: 'checklist', label: 'All done?' },
              { id: 'g2', kind: 'command', run: 'npm test', junk: 'x' },
              { id: 'g3', kind: 'approval', by: ['jonathan', 5] },
              { id: 'g4', kind: 'field', field: 'sev', equals: 'high', nonEmpty: true },
              { id: 'g5', kind: 'bogus' }, // unknown kind — dropped
              { id: '', kind: 'checklist' }, // no id — dropped
              { kind: 'checklist' }, // no id — dropped
              null,
            ],
            exit: [{ id: 'x1', kind: 'approval' }],
          },
          { id: 'todo', name: 'Todo', color: '#000' },
        ],
      },
      'b',
    );
    assert.deepStrictEqual(config.columns[0].enter, [
      { id: 'g1', kind: 'checklist', label: 'All done?' },
      { id: 'g2', kind: 'command', run: 'npm test' },
      { id: 'g3', kind: 'approval', by: ['jonathan'] },
      { id: 'g4', kind: 'field', field: 'sev', equals: 'high', nonEmpty: true },
    ]);
    assert.deepStrictEqual(config.columns[0].exit, [{ id: 'x1', kind: 'approval', by: [] }]);
  });

  test('columns without gates carry no enter/exit keys', () => {
    const config = normalizeBoardConfig(
      { name: 'B', columns: [{ id: 'todo', name: 'Todo', color: '#000' }] },
      'b',
    );
    assert.strictEqual(config.columns[0].enter, undefined);
    assert.strictEqual(config.columns[0].exit, undefined);
  });
});
