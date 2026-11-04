import type { Piece } from '../../../../arena/gambit.ts';

export interface TrackedPiece {
  id: number;
  p: Piece;
}

/**
 * Gives each piece a stable id from one position to the next: pieces that didn't move keep theirs, and a piece that moved
 * takes over the id of its side's piece that left its square. A piece's id never passes to the other side.
 */
export function trackPieces(prev: readonly TrackedPiece[], pieces: readonly Piece[]): TrackedPiece[] {
  const same = (a: Piece, b: Piece) => a.side === b.side && a.r === b.r && a.c === b.c;
  const used = new Set<number>();
  const out: TrackedPiece[] = [];
  const moved: Piece[] = [];
  for (const p of pieces) {
    const old = prev.find((o) => same(o.p, p) && !used.has(o.id));
    if (old) {
      used.add(old.id);
      out.push({ id: old.id, p });
    } else moved.push(p);
  }
  let next = prev.reduce((m, o) => Math.max(m, o.id + 1), 0);
  for (const p of moved) {
    const old = prev.find((o) => o.p.side === p.side && !used.has(o.id));
    const id = old ? old.id : next++;
    used.add(id);
    out.push({ id, p });
  }
  return out;
}
