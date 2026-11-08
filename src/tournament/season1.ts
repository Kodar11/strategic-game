import { SEASON_ONE_QUESTIONS } from './questions.ts';
import type { TournamentDoc } from './schema.ts';

/**
 * Season 1, bundled with the app. The same document is published from Supabase (supabase/tournament/manage.sql);
 * this copy is what a device uses before it has ever downloaded one, so the Tournament works offline from the first
 * launch. Rival names are working names.
 *
 * Every opponent in a tournament match is hidden: the rival plays one of the game's styles, and reading which one is
 * a star. Intel lines describe the game's trap, never which style the rival picked.
 */
export const SEASON_ONE: TournamentDoc = {
  schemaVersion: 1,
  id: 'main',
  // 2: question bank, Host welcome, Codebreaker side trial, Market and Power Play retuned.
  revision: 2,
  title: 'The Tournament',
  tagline: 'Five rivals. Every trick is real. Outthink them one at a time.',
  host: 'host',
  welcome: [
    'Welcome to the Tournament.',
    'Five rivals are waiting: a liar, a traitor, a puppeteer, a kingmaker and an architect.',
    'Each one plays a trick you can learn to beat. Read them, outthink them, and climb.',
    'First, three quick matches to qualify. Let’s see how you play.',
  ],
  questions: SEASON_ONE_QUESTIONS,
  rivals: [
    {
      id: 'host',
      name: 'The Host',
      epithet: 'Runs the Tournament',
      tone: 'amber',
      bio: 'Calm, polite, and always one move ahead. Watches every match.',
      lines: {
        onPlayerWin: ['Good. You read the room.', 'That is how it is done.'],
        onPlayerLoss: ['Everyone falls for that once.', 'Look again at what they showed you.'],
        defeated: 'So you were watching me all along. Well played.',
      },
    },
    {
      id: 'vesper',
      name: 'Vesper',
      epithet: 'The Liar',
      tone: 'orange',
      bio: 'Says everything with the same calm face, true or not.',
      lines: {
        onPlayerWin: ['You called it. Annoying.', 'Fine. You saw through that one.'],
        onPlayerLoss: ['You believed me. They always do.', 'Confidence is cheap. You paid for it.'],
        defeated: 'No more bluffs left. You win this one.',
      },
    },
    {
      id: 'kade',
      name: 'Kade',
      epithet: 'The Traitor',
      tone: 'blue',
      bio: 'Friendly until the moment it pays not to be.',
      lines: {
        onPlayerWin: ['You did not trust me. Smart.', 'You kept me honest. I hate that.'],
        onPlayerLoss: ['Nothing personal. It just paid more.', 'You trusted me one round too long.'],
        defeated: 'You made betrayal cost more than it paid. I am out.',
      },
    },
    {
      id: 'mirelle',
      name: 'Mirelle',
      epithet: 'The Puppeteer',
      tone: 'cyan',
      bio: 'Never in the spotlight. Always the one moving the pieces.',
      lines: {
        onPlayerWin: ['You followed the evidence, not the crowd.', 'So you can see the strings.'],
        onPlayerLoss: ['You looked where I wanted you to look.', 'The loudest voice is rarely the guilty one.'],
        defeated: 'You found me. Nobody finds me.',
      },
    },
    {
      id: 'osric',
      name: 'Osric',
      epithet: 'The Kingmaker',
      tone: 'success',
      bio: 'Buys power cheap and sells it dear. Every deal has a price.',
      lines: {
        onPlayerWin: ['You knew your worth. Rare.', 'A fair deal. I did not want one.'],
        onPlayerLoss: ['You took the first offer. Never take the first offer.', 'I needed you less than you needed me.'],
        defeated: 'You priced me out of my own market.',
      },
    },
    {
      id: 'tamsin',
      name: 'Tamsin',
      epithet: 'The Architect',
      tone: 'blue',
      bio: 'Plays long games. Forces you to choose between winning now and winning at all.',
      lines: {
        onPlayerWin: ['You thought past this round.', 'Patience. Good.'],
        onPlayerLoss: ['You grabbed today and lost tomorrow.', 'Some games you only win together.'],
        defeated: 'You built something that lasts. I can respect that.',
      },
    },
  ],
  seasons: [
    {
      id: 's1',
      title: 'Season 1',
      status: 'live',
      stages: [
        {
          id: 's1.qualifiers',
          kind: 'qualifiers',
          title: 'Qualifiers',
          theme: 'Reading an opponent',
          rival: 'host',
          style: 'calculator',
          lessons: [],
          intro: ['Welcome to the Tournament.', 'Three quick matches decide who gets in. Every opponent here hides how they play.', 'Watch, guess their style, and win.'],
          matches: [
            {
              id: 's1.q.rps',
              game: { system: 'classic', id: 'rps' },
              level: 'easy',
              intel: { tendency: 'Every player has a habit, even when they think they are random.', counter: 'Track what they did after a win and after a loss. Habits show up fast.', lesson: 'predictability-trap' },
            },
            {
              id: 's1.q.two-thirds',
              game: { system: 'classic', id: 'two-thirds' },
              level: 'easy',
              intel: { tendency: 'The crowd guesses how deeply everyone else is thinking.', counter: 'Aim one step deeper than the room, not ten. Too clever loses too.', lesson: 'strategy-detective' },
            },
            {
              id: 's1.q.ultimatum',
              game: { system: 'classic', id: 'ultimatum' },
              level: 'easy',
              intel: { tendency: 'Offers that look unfair get refused, even when refusing costs.', counter: 'Offer what they will accept, not the least they could. Test their line.', lesson: 'best-response' },
            },
          ],
        },
        {
          id: 's1.vesper',
          kind: 'arc',
          title: 'Arc 1',
          theme: 'Bluffing and signals',
          rival: 'vesper',
          style: 'manipulator',
          lessons: ['signaling', 'credibility', 'brinkmanship'],
          intro: ['Vesper never raises her voice. She never needs to.', '“Everything I tell you will sound true,” she says. “Your problem is deciding which parts are.”'],
          matches: [
            {
              id: 's1.vesper.liars-dice',
              game: { system: 'arena', id: 'liars-dice' },
              level: 'normal',
              intel: { tendency: 'Bids climb until someone blinks.', counter: 'Count what you can see. Call when a bid needs more than the hidden dice can plausibly hold.', lesson: 'credibility' },
            },
            {
              id: 's1.vesper.signal',
              game: { system: 'arena', id: 'signal' },
              level: 'normal',
              intel: { tendency: 'A signal only means something if faking it would cost too much.', counter: 'Trust signals that are expensive to send. Test the cheap ones.', lesson: 'signaling' },
            },
            {
              // A short match: in simulations Power Play is the hardest game to win at any level, so it is not a duel.
              id: 's1.vesper.power-play',
              game: { system: 'arena', id: 'power-play' },
              level: 'normal',
              length: 'short',
              intel: { tendency: 'She claims roles she does not hold and dares you to call it.', counter: 'A threat is only credible if carrying it out pays. Challenge the ones that would not.', lesson: 'brinkmanship' },
            },
            {
              id: 's1.vesper.bluff',
              game: { system: 'arena', id: 'bluff' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'Her claims come out with the same confidence, strong or weak.', counter: 'Confidence is not evidence. Challenge a claim when the odds say it is unlikely.', lesson: 'signaling' },
            },
          ],
        },
        {
          id: 's1.kade',
          kind: 'arc',
          title: 'Arc 2',
          theme: 'Trust and betrayal',
          rival: 'kade',
          style: 'diplomat',
          lessons: ['cooperation-trap', 'repeated-cooperation', 'coordination-problem', 'evolution'],
          intro: ['Kade shakes your hand and means it. For now.', '“We both do better if we trust each other,” he says. “That is exactly why one of us won’t.”'],
          matches: [
            {
              id: 's1.kade.split-steal',
              game: { system: 'classic', id: 'split-steal' },
              level: 'normal',
              intel: { tendency: 'Stealing always pays more in a single round.', counter: 'Over many rounds, answer betrayal fast and forgive once trust returns.', lesson: 'cooperation-trap' },
            },
            {
              id: 's1.kade.stag-hunt',
              game: { system: 'classic', id: 'stag-hunt' },
              level: 'normal',
              intel: { tendency: 'The big prize needs both of you. The safe prize needs nobody.', counter: 'Signal you are going for the stag, and watch whether they follow.', lesson: 'coordination-problem' },
            },
            {
              id: 's1.kade.travelers',
              game: { system: 'arena', id: 'travelers' },
              level: 'normal',
              intel: { tendency: 'Claiming one less always looks smarter, until both of you are at the bottom.', counter: 'Undercutting is a race to zero. Hold a high claim when they do.', lesson: 'evolution' },
            },
            {
              id: 's1.kade.cooperation',
              game: { system: 'arena', id: 'cooperation' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'Kade cooperates until he thinks you will not punish a defection.', counter: 'Make betrayal cost more than it pays: answer it every time, then let trust back in.', lesson: 'repeated-cooperation' },
            },
          ],
        },
        {
          id: 's1.mirelle',
          kind: 'arc',
          title: 'Arc 3',
          theme: 'Hidden roles',
          rival: 'mirelle',
          style: 'reader',
          lessons: ['bayesian-uncertainty', 'incentive-shift'],
          intro: ['Nobody remembers seeing Mirelle arrive.', '“Someone in every room is lying,” she says. “The trick is that it is never who everyone is looking at.”'],
          matches: [
            {
              id: 's1.mirelle.inspector',
              game: { system: 'arena', id: 'inspector' },
              level: 'normal',
              intel: { tendency: 'Cheating rises when checks look rare, and falls when they look certain.', counter: 'Mix your checks. Predictable inspection invites cheating at the gaps.', lesson: 'incentive-shift' },
            },
            {
              id: 's1.mirelle.mole',
              game: { system: 'arena', id: 'mole' },
              level: 'normal',
              intel: { tendency: 'Accusations spread through the room faster than evidence.', counter: 'Update on the clues, not the crowd. Ask how likely each clue is if each suspect were guilty.', lesson: 'bayesian-uncertainty' },
            },
            {
              id: 's1.mirelle.saboteur',
              game: { system: 'arena', id: 'saboteur' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'The saboteur stays quiet and lets missions fail around others.', counter: 'Track who was on every failed mission. The overlap points at the saboteur.', lesson: 'bayesian-uncertainty' },
            },
          ],
        },
        {
          id: 's1.osric',
          kind: 'arc',
          title: 'Arc 4',
          theme: 'Power and deals',
          rival: 'osric',
          style: 'diplomat',
          lessons: ['bargaining', 'coalitions', 'voting', 'auctions', 'market-competition', 'market-quality'],
          intro: ['Osric has a seat for you at his table. It costs something.', '“Power is just being needed,” he says. “Let me show you how cheaply it trades.”'],
          matches: [
            {
              id: 's1.osric.ultimatum-game',
              game: { system: 'arena', id: 'ultimatum-game' },
              level: 'normal',
              intel: { tendency: 'He opens low and waits to see if you take it.', counter: 'Your walk-away value is your power. Refuse offers below what rejecting costs them.', lesson: 'bargaining' },
            },
            {
              id: 's1.osric.auction',
              game: { system: 'arena', id: 'auction' },
              level: 'normal',
              intel: { tendency: 'The highest estimate usually wins, and usually overpays.', counter: 'Bid below your estimate. Winning the lot is not the same as winning money.', lesson: 'auctions' },
            },
            {
              // Short: a steady pricing plan wins about one match in seven at Normal, random pricing almost never.
              id: 's1.osric.market',
              game: { system: 'arena', id: 'market' },
              level: 'normal',
              length: 'short',
              intel: { tendency: 'A price cut wins customers for one round and starts a war.', counter: 'Match the market, punish undercuts, and avoid racing to the floor.', lesson: 'market-competition' },
            },
            {
              id: 's1.osric.coalition',
              game: { system: 'arena', id: 'coalition' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'He builds the cheapest winning coalition and keeps the rest.', counter: 'Be the partner he cannot replace cheaply. Your price is what you add to a majority.', lesson: 'coalitions' },
            },
          ],
        },
        {
          id: 's1.tamsin',
          kind: 'arc',
          title: 'Arc 5',
          theme: 'Long games and alliances',
          rival: 'tamsin',
          style: 'calculator',
          lessons: ['sequential-moves', 'war-of-attrition'],
          intro: ['Tamsin does not want to beat you. Not yet.', '“This round, we work together,” she says. “Let’s see if you can.”'],
          matches: [
            {
              id: 's1.tamsin.commons',
              game: { system: 'arena', id: 'commons' },
              level: 'normal',
              intel: { tendency: 'Everyone takes a little more, and the lake runs dry.', counter: 'Take less while the lake is low. Tomorrow’s catch depends on today’s restraint.', lesson: 'war-of-attrition' },
            },
            {
              id: 's1.tamsin.defusal',
              game: { system: 'arena', id: 'defusal' },
              level: 'normal',
              intel: { tendency: 'Neither of you has the whole answer.', counter: 'Share what you know before you act. Information is worth more combined.', lesson: 'sequential-moves' },
            },
            {
              id: 's1.tamsin.last-stand',
              game: { system: 'arena', id: 'last-stand' },
              level: 'normal',
              intel: { tendency: 'Fires break out everywhere. You cannot cover them all alone.', counter: 'Plan where your teammate is going, then cover what they will not.', lesson: 'sequential-moves' },
            },
            {
              id: 's1.tamsin.gambit',
              game: { system: 'arena', id: 'gambit' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'She trades a safe move now for a winning position later.', counter: 'Look ahead and reason back. The best move now depends on the reply it invites.', lesson: 'sequential-moves' },
            },
          ],
        },
        {
          id: 's1.final',
          kind: 'final',
          title: 'The Final',
          theme: 'Everything at once',
          rival: 'host',
          style: 'reader',
          lessons: ['strategic-practice'],
          intro: ['The Host stands up for the first time.', '“You have beaten everyone I sent,” the Host says. “Now play me. I use all their tricks.”'],
          matches: [
            {
              id: 's1.final.liars-dice',
              game: { system: 'arena', id: 'liars-dice' },
              level: 'hard',
              intel: { tendency: 'Vesper’s bluffs, with better odds behind them.', counter: 'Count, then call. Plausible is not certain.', lesson: 'credibility' },
            },
            {
              id: 's1.final.cooperation',
              game: { system: 'arena', id: 'cooperation' },
              level: 'hard',
              variant: 'noisy',
              intel: { tendency: 'Kade’s betrayals, hidden in honest mistakes.', counter: 'In a noisy world, forgive one slip. Punish a pattern.', lesson: 'repeated-cooperation' },
            },
            {
              id: 's1.final.mole',
              game: { system: 'arena', id: 'mole' },
              level: 'hard',
              variant: 'blurry',
              intel: { tendency: 'Mirelle’s misdirection, with blurrier clues.', counter: 'Weak evidence still adds up. Weigh every clue by how reliable it is.', lesson: 'bayesian-uncertainty' },
            },
            {
              id: 's1.final.coalition',
              game: { system: 'arena', id: 'coalition' },
              level: 'hard',
              intel: { tendency: 'Osric’s deals, at harder prices.', counter: 'Know your value to every majority before you accept a seat.', lesson: 'coalitions' },
            },
            {
              id: 's1.final.gambit',
              game: { system: 'arena', id: 'gambit' },
              level: 'hard',
              duel: true,
              intel: { tendency: 'Tamsin’s patience, all at once.', counter: 'Think several moves ahead, and use every idea you have learned.', lesson: 'strategic-practice' },
            },
          ],
        },
        {
          id: 's1.side',
          kind: 'side',
          title: 'Side trial',
          theme: 'Saying exactly what you mean',
          rival: 'host',
          style: 'reader',
          lessons: [],
          intro: ['A trial off the bracket. Nothing rides on it but your pride.', '“One word,” the Host says. “Make your partner hear what you meant.”'],
          matches: [
            {
              id: 's1.side.codebreaker',
              game: { system: 'arena', id: 'codebreaker' },
              level: 'normal',
              intel: { tendency: 'A clue can point at more than one word.', counter: 'Think about how your partner reads it, not how you meant it. Pick the clue only one answer fits.', lesson: 'coordination-problem' },
            },
          ],
        },
      ],
    },
  ],
};
