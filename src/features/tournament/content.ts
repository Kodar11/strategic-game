import { create } from 'zustand';

import { type Rival, type Season, type TournamentDoc, liveSeason, parseTournament } from '@/src/tournament/schema';
import { SEASON_ONE } from '@/src/tournament/season1';

/**
 * The installed tournament document. Season 1 (bundled) is installed from the first render, so the Tournament never
 * waits for the network; start-up then swaps in the cached or downloaded copy if it validates (src/data/session.ts).
 */
interface TournamentContent {
  doc: TournamentDoc;
  season: Season;
}

const bundled = parseTournament(SEASON_ONE) ?? SEASON_ONE;

export const useTournamentContent = create<TournamentContent>(() => ({ doc: bundled, season: liveSeason(bundled) ?? bundled.seasons[0] }));

/** Installs a downloaded or cached document, unless it is older than the copy bundled with this app. */
export function installTournament(doc: TournamentDoc): void {
  if (doc.revision < bundled.revision) return;
  const season = liveSeason(doc);
  if (season) useTournamentContent.setState({ doc, season });
}

export const useSeason = () => useTournamentContent((s) => s.season);

export function rivalOf(doc: TournamentDoc, id: string): Rival {
  return doc.rivals.find((r) => r.id === id) ?? doc.rivals[0];
}

export const useRival = (id: string) => useTournamentContent((s) => rivalOf(s.doc, id));
