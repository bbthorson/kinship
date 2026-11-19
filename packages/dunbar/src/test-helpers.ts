import type { DunbarEvent } from './model';

export const T0 = Date.UTC(2027, 0, 4);
let seq = 0;

type Body = DunbarEvent extends infer E ? (E extends DunbarEvent ? Omit<E, 'tid' | 'contactId'> : never) : never;

/** Build an event with a fresh, increasing tid. Call order is tid order. */
export function ev(e: Body, contactId = 'c1'): DunbarEvent {
  return { tid: `3l${String(seq++).padStart(11, '0')}`, contactId, ...e } as DunbarEvent;
}
