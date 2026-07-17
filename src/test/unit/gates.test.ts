import * as assert from 'assert';
import { evaluateGates, evaluateTransition } from '../../core/gates';
import { Card, Column, GateDef } from '../../core/types';

function baseCard(over: Partial<Card> = {}): Card {
  return { id: 'card', title: 'Card', ...over };
}

function col(id: string, over: Partial<Column> = {}): Column {
  return { id, name: id, color: '#000', cardIds: [], ...over };
}

function one(card: Card, gate: GateDef): { satisfied: boolean; reason: string } {
  const [r] = evaluateGates(card, [gate]);
  return { satisfied: r.satisfied, reason: r.reason };
}

suite('gates — checklist', () => {
  const gate: GateDef = { id: 'g', kind: 'checklist' };

  test('absent checklist is satisfied', () => {
    assert.deepStrictEqual(one(baseCard(), gate), { satisfied: true, reason: 'checklist 0/0' });
  });

  test('all done is satisfied; partial is not', () => {
    const done = baseCard({ checklist: [{ text: 'a', done: true }, { text: 'b', done: true }] });
    const partial = baseCard({ checklist: [{ text: 'a', done: true }, { text: 'b', done: false }] });
    assert.deepStrictEqual(one(done, gate), { satisfied: true, reason: 'checklist 2/2' });
    assert.deepStrictEqual(one(partial, gate), { satisfied: false, reason: 'checklist 1/2' });
  });
});

suite('gates — field', () => {
  test('nonEmpty semantics on a custom field', () => {
    const gate: GateDef = { id: 'g', kind: 'field', field: 'sev', nonEmpty: true };
    assert.deepStrictEqual(one(baseCard({ custom: { sev: 'high' } }), gate), {
      satisfied: true,
      reason: 'sev is set',
    });
    assert.deepStrictEqual(one(baseCard({ custom: { sev: '' } }), gate), {
      satisfied: false,
      reason: 'sev is empty',
    });
    assert.strictEqual(one(baseCard(), gate).satisfied, false);
  });

  test('empty array counts as empty; non-empty array is set', () => {
    const gate: GateDef = { id: 'g', kind: 'field', field: 'tags' };
    assert.strictEqual(one(baseCard({ custom: { tags: [] } }), gate).satisfied, false);
    assert.strictEqual(one(baseCard({ custom: { tags: ['x'] } }), gate).satisfied, true);
  });

  test('equals compares the stringified value', () => {
    const gate: GateDef = { id: 'g', kind: 'field', field: 'sev', equals: 'high' };
    assert.deepStrictEqual(one(baseCard({ custom: { sev: 'high' } }), gate), {
      satisfied: true,
      reason: 'sev = high',
    });
    assert.deepStrictEqual(one(baseCard({ custom: { sev: 'low' } }), gate), {
      satisfied: false,
      reason: 'sev must equal high',
    });
  });

  test('falls back to reserved card props for known field ids', () => {
    const gate: GateDef = { id: 'g', kind: 'field', field: 'priority', equals: 'high' };
    assert.strictEqual(one(baseCard({ priority: 'high' }), gate).satisfied, true);
    assert.strictEqual(one(baseCard({ priority: 'low' }), gate).satisfied, false);
    const agentGate: GateDef = { id: 'g', kind: 'field', field: 'agent' };
    assert.strictEqual(one(baseCard({ agent: 'claude' }), agentGate).satisfied, true);
    assert.strictEqual(one(baseCard(), agentGate).satisfied, false);
  });
});

suite('gates — command', () => {
  const gate: GateDef = { id: 'ci', kind: 'command', run: 'npm test' };

  test('satisfied by a done evidence line; reason is the note when present', () => {
    const card = baseCard({ gates: [{ gateId: 'ci', done: true, note: 'passed' }] });
    assert.deepStrictEqual(one(card, gate), { satisfied: true, reason: 'passed' });
  });

  test('done without a note falls back to a ran-command reason', () => {
    const card = baseCard({ gates: [{ gateId: 'ci', done: true }] });
    assert.deepStrictEqual(one(card, gate), { satisfied: true, reason: 'ran `npm test`' });
  });

  test('no evidence (or not done) is unsatisfied', () => {
    assert.deepStrictEqual(one(baseCard(), gate), {
      satisfied: false,
      reason: 'no recorded run of `npm test`',
    });
    const notDone = baseCard({ gates: [{ gateId: 'ci', done: false }] });
    assert.strictEqual(one(notDone, gate).satisfied, false);
  });
});

suite('gates — approval', () => {
  test('matches an approver by case-insensitive substring', () => {
    const gate: GateDef = { id: 'signoff', kind: 'approval', by: ['jonathan'] };
    const card = baseCard({
      gates: [{ gateId: 'signoff', done: true, note: 'approved (Jonathan, 2026-01-01)' }],
    });
    assert.deepStrictEqual(one(card, gate), {
      satisfied: true,
      reason: 'approved (Jonathan, 2026-01-01)',
    });
  });

  test('unsatisfied when no evidence names an allowed approver', () => {
    const gate: GateDef = { id: 'signoff', kind: 'approval', by: ['alice'] };
    const card = baseCard({ gates: [{ gateId: 'signoff', done: true, note: 'approved (bob)' }] });
    assert.deepStrictEqual(one(card, gate), {
      satisfied: false,
      reason: 'awaiting approval by alice',
    });
  });

  test('empty by is satisfied by any done evidence', () => {
    const gate: GateDef = { id: 'signoff', kind: 'approval', by: [] };
    assert.strictEqual(
      one(baseCard({ gates: [{ gateId: 'signoff', done: true }] }), gate).satisfied,
      true,
    );
    assert.strictEqual(
      one(baseCard({ gates: [{ gateId: 'signoff', done: false }] }), gate).satisfied,
      false,
    );
  });
});

suite('gates — evaluateTransition', () => {
  const exit: GateDef = { id: 'e', kind: 'checklist' };
  const enter: GateDef = { id: 'n', kind: 'field', field: 'sev', nonEmpty: true };

  test('combines the source exit gates with the target enter gates, in order', () => {
    const from = col('a', { exit: [exit] });
    const to = col('b', { enter: [enter] });
    const results = evaluateTransition(baseCard(), from, to);
    assert.deepStrictEqual(
      results.map((r) => r.gate.id),
      ['e', 'n'],
    );
  });

  test('a move within the same column has no gates', () => {
    const same = col('a', { exit: [exit], enter: [enter] });
    assert.deepStrictEqual(evaluateTransition(baseCard(), same, same), []);
  });

  test('an undefined source contributes only the target enter gates', () => {
    const to = col('b', { enter: [enter] });
    const results = evaluateTransition(baseCard(), undefined, to);
    assert.deepStrictEqual(
      results.map((r) => r.gate.id),
      ['n'],
    );
  });
});
