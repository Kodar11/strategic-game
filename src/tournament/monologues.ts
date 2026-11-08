/**
 * The player's inner voice in each Season 1 match: one line as the game starts, one around the middle, one before
 * the last round. Lines name a pattern to watch for, never the answer, and never which hidden style the rival is
 * using. Merged into the matches in season1.ts, so they publish with the rest of the document.
 */
export const SEASON_ONE_MONOLOGUES: Record<string, { start: string; mid: string; late: string }> = {
  's1.q.rps': { start: 'Nobody is truly random. Watch what comes after a win.', mid: 'Is that a pattern, or am I seeing faces in clouds?', late: 'Last throws. Do they repeat when they are ahead?' },
  's1.q.two-thirds': { start: 'Everyone is guessing what everyone else will guess.', mid: 'The room drifted lower. Did they all think one step more?', late: 'One step deeper than the crowd. Not ten.' },
  's1.q.ultimatum': { start: 'An offer is only good if they will take it.', mid: 'Where is their line? Every answer tells me a little more.', late: 'Last split. Greed now could cost me everything.' },

  's1.vesper.liars-dice': { start: 'Count the dice I can see before I believe a word.', mid: 'That bid needs a lot of hidden dice. Does she have them?', late: 'Plausible is not certain. Is this the moment to call?' },
  's1.vesper.signal': { start: 'Cheap words prove nothing. What would a lie cost her?', mid: 'She sent a strong signal. Was it expensive, or just loud?', late: 'One more choice. Trust the costly signals, test the rest.' },
  's1.vesper.power-play': { start: 'She will claim roles she does not hold. Which threats would she carry out?', mid: 'Calling a bluff costs me too. Is this one worth it?', late: 'Last turns. A threat that would not pay is just noise.' },
  's1.vesper.bluff': { start: 'She claimed big twice. Either she has it, or she wants me to think so.', mid: 'Same calm face for strong and weak. The odds have to decide.', late: 'Final claim. Does what I have seen make it likely?' },

  's1.kade.split-steal': { start: 'He smiles a lot. Smiles are free.', mid: 'He stole once. Was it a slip, or a test of my reply?', late: 'Last rounds. Does he think the future has stopped mattering?' },
  's1.kade.stag-hunt': { start: 'The stag needs both of us. The hare needs nobody.', mid: 'He went for the hare. Fear, or a habit?', late: 'Do I signal the stag one more time, or take the safe catch?' },
  's1.kade.travelers': { start: 'One less always looks smarter. Until we are both at the bottom.', mid: 'Are we racing down? Someone has to stop first.', late: 'A high claim only pays if he holds his too.' },
  's1.kade.cooperation': { start: 'He will cooperate until he thinks I will not answer.', mid: 'Did I make betrayal cost him, or did I let it slide?', late: 'The end is close. This is when traitors stop pretending.' },

  's1.mirelle.inspector': { start: 'If my checks are predictable, the cheating moves to the gaps.', mid: 'Is she cheating more when I have not checked for a while?', late: 'Mix it up. Certainty is what she is waiting for.' },
  's1.mirelle.mole': { start: 'The loudest accusation is rarely the guilty one.', mid: 'Everyone is pointing the same way. Is that evidence, or an echo?', late: 'Weigh the clues, not the crowd. Who fits all of them?' },
  's1.mirelle.saboteur': { start: 'The saboteur stays quiet and lets missions fail around others.', mid: 'Who was on every failed mission? Start there.', late: 'One overlap is chance. Two is a pattern.' },

  's1.osric.ultimatum-game': { start: 'His first offer is a test. My walk-away is my power.', mid: 'He raised it once I refused. So refusing works.', late: 'Last split. Take a fair deal, refuse an insult.' },
  's1.osric.auction': { start: 'The highest estimate wins, and usually overpays.', mid: 'Did I win that lot, or did I just lose money politely?', late: 'Bid below my estimate. Winning is not the goal. Profit is.' },
  's1.osric.market': { start: 'A price cut wins one round and starts a war.', mid: 'He undercut me. Answer it, or start a race to zero?', late: 'Steady prices beat a war neither of us can win.' },
  's1.osric.coalition': { start: 'He builds the cheapest majority. How do I become expensive?', mid: 'Who does he need, and who can he replace?', late: 'My price is what I add to a majority. Not a seat more.' },

  's1.tamsin.commons': { start: 'Every boat takes a little more. The lake notices.', mid: 'The lake is lower. Do I hold back while others grab?', late: 'Last seasons. Is there any future left to protect?' },
  's1.tamsin.defusal': { start: 'Neither of us has the whole answer. Share before acting.', mid: 'What does she know that I do not? Ask with the next clue.', late: 'One wrong cut ends it. Combine what we both saw.' },
  's1.tamsin.last-stand': { start: 'Fires everywhere. I cannot cover them all alone.', mid: 'Where is she going next? Cover what she will not.', late: 'Hold the line together. Nobody wins alone here.' },
  's1.tamsin.gambit': { start: 'Every move invites a reply. Think about the reply first.', mid: 'She gave up something safe. What is she setting up?', late: 'Look ahead, reason back. Which move leaves her nothing?' },

  's1.final.liars-dice': { start: 'Vesper’s bluffs, but better odds behind them. Count first.', mid: 'Every bid is a story. Does the arithmetic agree?', late: 'Call only when the hidden dice cannot carry the claim.' },
  's1.final.cooperation': { start: 'Kade’s betrayals, hidden in honest mistakes.', mid: 'Was that a slip or a plan? One slip is forgivable.', late: 'Punish a pattern, not an accident.' },
  's1.final.mole': { start: 'Mirelle’s misdirection, through blurry footage.', mid: 'Weak clues still add up. Which way do they all lean?', late: 'Trust the weight of evidence, not the loudest voice.' },
  's1.final.coalition': { start: 'Osric’s deals, at harder prices.', mid: 'Who needs me most right now? That is my leverage.', late: 'Know my value before I take a seat.' },
  's1.final.gambit': { start: 'Everything I have learned, all at once.', mid: 'The Host is patient. So am I.', late: 'Last moves. Think one step past the obvious.' },

  's1.side.codebreaker': { start: 'One word. It has to point at only one answer.', mid: 'How would they read that clue, not how did I mean it?', late: 'Pick the clue nothing else fits.' },
};
