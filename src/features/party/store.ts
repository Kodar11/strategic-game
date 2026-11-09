import { create } from 'zustand';

/**
 * Party mode's player list, in memory only: names typed for tonight's game, kept while the app is open so a second
 * game doesn't need them typed again. Nothing about a party is stored on the device or sent anywhere.
 */
interface PartyState {
  players: string[];
  setPlayers: (players: string[]) => void;
}

export const useParty = create<PartyState>()((set) => ({
  players: [],
  setPlayers: (players) => set({ players }),
}));
