/**
 * Pure gate evaluation. Given a card and a set of {@link GateDef gates}, decides
 * whether each is satisfied and why. No I/O, no vscode — the store wires this to
 * column transitions and the UI renders the {@link GateResult reasons}.
 */

import { Card, Column, CustomFieldValue, GateDef, GateResult } from './types';

/** Evaluates each gate against the card, in order. */
export function evaluateGates(card: Card, gates: GateDef[]): GateResult[] {
  return gates.map((gate) => evaluateGate(card, gate));
}

/**
 * Gates that apply to moving `card` from `from` into `to`: the source column's
 * `exit` gates followed by the target's `enter` gates. A move within the same
 * column (or a no-op) has no gates.
 */
export function evaluateTransition(
  card: Card,
  from: Column | undefined,
  to: Column,
): GateResult[] {
  if (from && from.id === to.id) {
    return [];
  }
  const gates = [...(from?.exit ?? []), ...(to.enter ?? [])];
  return evaluateGates(card, gates);
}

// ---------------------------------------------------------------------------

function evaluateGate(card: Card, gate: GateDef): GateResult {
  switch (gate.kind) {
    case 'checklist':
      return checklistResult(card, gate);
    case 'field':
      return fieldResult(card, gate);
    case 'command':
      return commandResult(card, gate);
    case 'approval':
      return approvalResult(card, gate);
    default:
      return { gate, satisfied: true, reason: gate.label ?? gate.id };
  }
}

/** Satisfied when the checklist is absent/empty or every item is done. */
function checklistResult(card: Card, gate: GateDef): GateResult {
  const items = card.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const satisfied = total === 0 || done === total;
  return { gate, satisfied, reason: `checklist ${done}/${total}` };
}

/** Inspects a custom (or reserved) field for presence / equality. */
function fieldResult(card: Card, gate: GateDef): GateResult {
  const fieldId = gate.field ?? '';
  const value = resolveFieldValue(card, fieldId);
  const name = gate.field ?? gate.label ?? gate.id;

  if (gate.equals !== undefined) {
    const satisfied = value !== undefined && String(value) === gate.equals;
    return {
      gate,
      satisfied,
      reason: satisfied ? `${name} = ${gate.equals}` : `${name} must equal ${gate.equals}`,
    };
  }

  const present = isNonEmpty(value);
  return { gate, satisfied: present, reason: present ? `${name} is set` : `${name} is empty` };
}

/** Satisfied when the card records a done run for this gate id. */
function commandResult(card: Card, gate: GateDef): GateResult {
  const evidence = (card.gates ?? []).find((g) => g.gateId === gate.id && g.done);
  const run = gate.run ?? gate.id;
  if (evidence) {
    return { gate, satisfied: true, reason: evidence.note ?? `ran \`${run}\`` };
  }
  return { gate, satisfied: false, reason: `no recorded run of \`${run}\`` };
}

/**
 * Satisfied when a done evidence line names an allowed approver (case-insensitive
 * substring). When `by` is empty, any done evidence for the gate satisfies it.
 */
function approvalResult(card: Card, gate: GateDef): GateResult {
  const dones = (card.gates ?? []).filter((g) => g.gateId === gate.id && g.done);
  const by = gate.by ?? [];
  const match =
    by.length === 0
      ? dones[0]
      : dones.find((g) => {
          const note = (g.note ?? '').toLowerCase();
          return by.some((who) => note.includes(who.toLowerCase()));
        });
  if (match) {
    return { gate, satisfied: true, reason: match.note ?? 'approved' };
  }
  const who = by.join(', ');
  return { gate, satisfied: false, reason: who ? `awaiting approval by ${who}` : 'awaiting approval' };
}

/** The field value, preferring custom fields and falling back to reserved props. */
function resolveFieldValue(card: Card, fieldId: string): CustomFieldValue | undefined {
  if (card.custom && fieldId in card.custom) {
    return card.custom[fieldId];
  }
  switch (fieldId) {
    case 'priority':
      return card.priority;
    case 'agent':
      return card.agent;
    case 'labels':
      return card.labels;
    case 'live':
      return card.live;
    case 'status':
      return card.status;
    case 'progress':
      return card.progress;
    case 'comments':
      return card.comments;
    case 'title':
      return card.title;
    case 'updatedAt':
      return card.updatedAt;
    case 'id':
      return card.id;
    default:
      return undefined;
  }
}

function isNonEmpty(value: CustomFieldValue | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return String(value).trim() !== '';
}
