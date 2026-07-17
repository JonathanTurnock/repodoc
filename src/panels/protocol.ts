import { BoardData, CustomFieldValue, RepoDocConfig } from '../core/types';

/**
 * Authoritative shapes for the board webview postMessage protocol.
 *
 * NOTE: `media/board.js` mirrors this contract MANUALLY. The webview is
 * deliberately build-step-free (plain JS loaded straight into the webview), so
 * there is no shared compilation between this file and board.js. Any change to
 * these shapes must be reflected by hand in media/board.js.
 *
 * Inbound (webview -> host) messages are UNTRUSTED: the discriminated unions
 * below describe their intended shape, but callers must still validate fields
 * at runtime before acting on them.
 */

/** Messages sent from the extension host down to the webview. */
export interface DataMessage {
  type: 'data';
  boardId: string;
  board: BoardData;
  config: RepoDocConfig;
  /** Display path of the board's data directory, e.g. `boards/<id>/`. */
  boardPath: string;
}


/** Host-driven card open (tests / automation) — mirrors clicking the card. */
export interface OpenCardMessage {
  type: 'openCard';
  cardId: string;
}

/** One unsatisfied (or satisfied) gate as reported to the webview. */
export interface MoveBlockedGate {
  id: string;
  label: string;
  satisfied: boolean;
  reason: string;
}

/**
 * Sent when a `moveCard` (without override) is blocked by one or more unmet
 * column gates. The webview surfaces the gates and can retry with override.
 */
export interface MoveBlockedMessage {
  type: 'moveBlocked';
  cardId: string;
  toColumn: string;
  results: MoveBlockedGate[];
}

export type HostToWebviewMessage = DataMessage | OpenCardMessage | MoveBlockedMessage;

/** Messages sent from the webview up to the extension host. */
export interface ReadyMessage {
  type: 'ready';
}

export interface MoveCardMessage {
  type: 'moveCard';
  cardId: string;
  toColumn: string;
  index: number;
  /** Force the move past any unsatisfied gates (records overrides). */
  override?: boolean;
}

/** Set (or clear, when `value` is null) a card's custom field. */
export interface SetFieldMessage {
  type: 'setField';
  cardId: string;
  fieldId: string;
  value: CustomFieldValue | null;
}

/** Record the local identity's approval of an approval gate. */
export interface ApproveGateMessage {
  type: 'approveGate';
  cardId: string;
  gateId: string;
}

export interface AddCardMessage {
  type: 'addCard';
  column: string;
  title: string;
}

export interface AddColumnMessage {
  type: 'addColumn';
}

export interface ToggleCheckMessage {
  type: 'toggleCheck';
  cardId: string;
  index: number;
}

export type WebviewToHostMessage =
  | ReadyMessage
  | MoveCardMessage
  | AddCardMessage
  | AddColumnMessage
  | ToggleCheckMessage
  | SetFieldMessage
  | ApproveGateMessage;
