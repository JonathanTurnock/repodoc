import { ClockPort } from '../core/ports';

/** Real wall-clock ClockPort. */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
