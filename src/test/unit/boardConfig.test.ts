import * as assert from 'assert';
import { normalizeBoardConfig } from '../../core/boardConfig';

suite('boardConfig.normalizeBoardConfig — fallbacks', () => {
  test('undefined input yields a board named from the id with empty maps', () => {
    assert.deepStrictEqual(normalizeBoardConfig(undefined, 'my-board'), {
      name: 'My Board',
      columns: [],
      labels: {},
      agents: {},
    });
  });

  test('non-object input (string/number/array) falls back', () => {
    for (const bad of ['nope', 42, ['a']] as unknown[]) {
      assert.deepStrictEqual(normalizeBoardConfig(bad, 'b'), {
        name: 'B',
        columns: [],
        labels: {},
        agents: {},
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
