import type { Party, StrokeBatch, StrokeSnapshot } from '@marriage/shared';

type Draft = { batches: StrokeBatch[]; sequence: number; points: number };
type RoomDraft = Record<Party, Draft> & { touchedAt: number };
const empty = (): Draft => ({ batches: [], sequence: 0, points: 0 });

export class StrokeCache {
  private rooms = new Map<string, RoomDraft>();
  constructor(
    private maxPoints = 20_000,
    private ttlMs = 3_600_000,
  ) {}
  append(contractId: string, party: Party, batch: StrokeBatch) {
    const room = this.room(contractId);
    const draft = room[party];
    if (draft.points + batch.points.length > this.maxPoints)
      throw new Error('STROKE_LIMIT');
    draft.batches.push(structuredClone(batch));
    draft.points += batch.points.length;
    draft.sequence += 1;
    room.touchedAt = Date.now();
    return draft.sequence;
  }
  clear(contractId: string, party: Party) {
    const room = this.room(contractId);
    room[party] = empty();
    room.touchedAt = Date.now();
  }
  snapshot(contractId: string): StrokeSnapshot {
    const room = this.room(contractId);
    return {
      strokes: {
        party_a: structuredClone(room.party_a.batches),
        party_b: structuredClone(room.party_b.batches),
      },
      sequences: {
        party_a: room.party_a.sequence,
        party_b: room.party_b.sequence,
      },
    };
  }
  sweep(now = Date.now()) {
    for (const [id, room] of this.rooms)
      if (room.touchedAt < now - this.ttlMs) this.rooms.delete(id);
  }
  private room(id: string) {
    let room = this.rooms.get(id);
    if (!room) {
      room = { party_a: empty(), party_b: empty(), touchedAt: Date.now() };
      this.rooms.set(id, room);
    }
    return room;
  }
}
