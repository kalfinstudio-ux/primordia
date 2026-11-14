import { eventBus } from '../core/eventBus';
import type { AwayReport } from '../data/eden';

let pending: AwayReport | null = null;

export function setAwayReport(r: AwayReport): void {
  pending = r;
  eventBus.emit('away:report', r);
}

export function takeAwayReport(): AwayReport | null {
  const r = pending;
  pending = null;
  return r;
}
