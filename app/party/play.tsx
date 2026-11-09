import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, BookOpen, Eye, EyeOff, Moon, RotateCcw, Sun } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { Slider } from '@/src/components/ui/Slider';
import { DailyFrame, OptionButton } from '@/src/features/daily-mix/ui';
import { useParty } from '@/src/features/party/store';
import {
  PARTY_GAMES,
  POT_COINS,
  POT_ROUNDS,
  type PartyGame,
  TWO_THIRDS_ROUNDS,
  banish,
  canStart,
  fellowTraitors,
  murder,
  nightOrder,
  scoreGuesses,
  scorePot,
  seeded,
  standings,
  startTraitors,
  victims,
} from '@/src/party/party';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

const isGame = (x: unknown): x is PartyGame => x === 'traitors' || x === 'two-thirds' || x === 'pot';

export default function PartyPlayScreen() {
  const { game, again } = useLocalSearchParams<{ game?: string; again?: string }>();
  const players = useParty((s) => s.players);
  if (!isGame(game) || !canStart(game, players)) return <MessageScreen title="Set up the party first" body="Add the players and pick a game on the Party mode screen." />;
  // `again` changes on "Play again", so the game starts over from a clean state.
  const k = again ?? '0';
  return (
    <DailyFrame title={PARTY_GAMES[game].title} overline="Party mode">
      {game === 'traitors' ? <Traitors key={k} players={players} /> : game === 'two-thirds' ? <TwoThirds key={k} players={players} /> : <Pot key={k} players={players} />}
    </DailyFrame>
  );
}

// ── The pass-the-phone turn ──────────────────────────────────────────────────

/**
 * One player's private moment: "Pass the phone to Asha" until Asha taps that it's her, then her secret screen. The
 * secret screen calls `done` when she has chosen; the next turn starts on a blank hand-off screen, so nothing she saw
 * is left showing.
 */
function Turn({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <View style={styles.handoff}>
        <EyeOff size={28} color={colors.textMuted} />
        <AppText variant="small" color={colors.textMuted} align="center">
          Pass the phone to
        </AppText>
        <AppText variant="title" align="center">
          {name}
        </AppText>
        <AppText variant="caption" color={colors.textFaint} align="center">
          Everyone else, look away.
        </AppText>
        <Button label={`I’m ${name}`} icon={Eye} onPress={() => setOpen(true)} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }
  return <View style={{ gap: space.md }}>{children}</View>;
}

/** Runs `players` (indices) through a private turn each, then calls `onAll` with every answer in order. */
function PassAround<T>({ order, names, ask, onAll }: { order: number[]; names: string[]; ask: (player: number, done: (answer: T) => void) => ReactNode; onAll: (answers: T[]) => void }) {
  const [k, setK] = useState(0);
  const [answers, setAnswers] = useState<T[]>([]);
  const p = order[k];
  const done = (a: T) => {
    haptic.commit();
    const next = [...answers, a];
    if (k + 1 >= order.length) onAll(next);
    else {
      setAnswers(next);
      setK(k + 1);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="caption" color={colors.textMuted} align="center">
        {k + 1} of {order.length}
      </AppText>
      <Turn key={k} name={names[p]}>
        {ask(p, done)}
      </Turn>
    </View>
  );
}

function Public({ children }: { children: ReactNode }) {
  return <View style={styles.public}>{children}</View>;
}

function NumberPick({ onDone }: { onDone: (n: number) => void }) {
  const [v, setV] = useState(50);
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="number" align="center" color={colors.primaryText} tabular>
        {v}
      </AppText>
      <Slider value={v} min={0} max={100} step={1} onChange={setV} label="Your number" hideLabel showValue={false} />
      <Button label={`Lock in ${v}`} onPress={() => onDone(v)} />
    </View>
  );
}

function Scoreboard({ players, totals, unit }: { players: string[]; totals: number[]; unit: string }) {
  return (
    <View style={{ gap: space.xs }}>
      {standings(players, totals).map((r) => (
        <View key={r.name} style={styles.scoreRow}>
          <AppText variant="bodyStrong" color={r.place === 1 ? colors.insight : colors.textMuted} style={{ width: 28 }} tabular>
            {r.place}
          </AppText>
          <AppText variant="body" style={{ flex: 1 }}>
            {r.name}
          </AppText>
          <AppText variant="bodyStrong" tabular>
            {r.total} {unit}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function End({ game, children }: { game: PartyGame; children?: ReactNode }) {
  const lesson = PARTY_GAMES[game].lesson;
  return (
    <View style={{ gap: space.sm }}>
      {children}
      <Button label="Play again" icon={RotateCcw} iconPosition="left" onPress={() => router.replace({ pathname: '/party/play', params: { game, again: String(Date.now()) } })} />
      <Button label="Change game or players" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/party'))} />
      {lesson ? <Button label="The idea behind it" variant="ghost" icon={BookOpen} iconPosition="left" onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson } })} /> : null}
    </View>
  );
}

// ── The Traitors ─────────────────────────────────────────────────────────────

function Traitors({ players }: { players: string[] }) {
  const [seed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const [state, setState] = useState(() => startTraitors(players, seeded(seed)));
  const [step, setStep] = useState<'roles' | 'day' | 'night' | 'morning'>('roles');
  const [nightKey, setNightKey] = useState(0);
  const order = useMemo(() => players.map((_, i) => i), [players]);
  const alive = state.players.map((_, i) => i).filter((i) => state.alive[i]);

  if (step === 'roles') {
    return (
      <PassAround<null>
        order={order}
        names={players}
        ask={(p, done) => {
          const traitor = state.roles[p] === 'traitor';
          const fellows = fellowTraitors(state, p).map((i) => players[i]);
          return (
            <View style={[styles.secret, { borderColor: traitor ? colors.rival : colors.primary }]}>
              <AppText variant="overline" color={traitor ? colors.rivalText : colors.primaryText}>
                Your role
              </AppText>
              <AppText variant="title">{traitor ? 'Traitor' : 'Faithful'}</AppText>
              <AppText variant="small" color={colors.textBody}>
                {traitor ? `Each night you remove one Faithful. By day, blend in.${fellows.length ? ` Your fellow Traitor: ${fellows.join(', ')}.` : ''}` : 'Find the Traitors. By day, argue, accuse, and vote one player out.'}
              </AppText>
              <Button label="Hide and pass on" icon={EyeOff} iconPosition="left" onPress={() => done(null)} />
            </View>
          );
        }}
        onAll={() => setStep('day')}
      />
    );
  }

  if (state.phase === 'over') {
    const traitors = state.players.filter((_, i) => state.roles[i] === 'traitor');
    return (
      <End game="traitors">
        <Public>
          {state.last ? <LastEvent state={state} /> : null}
          <AppText variant="title" color={state.winner === 'faithful' ? colors.primaryText : colors.rivalText}>
            {state.winner === 'faithful' ? 'The Faithful win' : 'The Traitors win'}
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            The Traitor{traitors.length > 1 ? 's were' : ' was'} {traitors.join(' and ')}.
          </AppText>
        </Public>
      </End>
    );
  }

  if (step === 'night') {
    const vs = victims(state);
    return (
      <PassAround<number | null>
        key={nightKey}
        order={nightOrder(state)}
        names={players}
        ask={(p, done) => {
          const traitor = state.roles[p] === 'traitor';
          // The first living Traitor in turn order chooses; the others see the choice.
          const firstTraitor = nightOrder(state).find((i) => state.roles[i] === 'traitor');
          if (!traitor) {
            return (
              <View style={styles.secret}>
                <Moon size={22} color={colors.textMuted} />
                <AppText variant="heading">You’re asleep</AppText>
                <AppText variant="small" color={colors.textBody}>
                  Take a moment, so nobody can tell who was choosing. Then hide and pass on.
                </AppText>
                <Button label="Hide and pass on" icon={EyeOff} iconPosition="left" onPress={() => done(null)} />
              </View>
            );
          }
          if (p !== firstTraitor) {
            return (
              <View style={[styles.secret, { borderColor: colors.rival }]}>
                <AppText variant="heading">Your partner has chosen</AppText>
                <AppText variant="small" color={colors.textBody}>
                  Tonight’s target was picked by {players[firstTraitor!]}. Hide and pass on.
                </AppText>
                <Button label="Hide and pass on" icon={EyeOff} iconPosition="left" onPress={() => done(null)} />
              </View>
            );
          }
          return (
            <View style={[styles.secret, { borderColor: colors.rival }]}>
              <AppText variant="heading" color={colors.rivalText}>
                Choose tonight’s target
              </AppText>
              {vs.map((v) => (
                <OptionButton key={v} label={players[v]} onPress={() => done(v)} />
              ))}
            </View>
          );
        }}
        onAll={(answers) => {
          const victim = answers.find((a): a is number => typeof a === 'number');
          if (victim !== undefined) setState(murder(state, victim));
          setStep('morning');
        }}
      />
    );
  }

  if (step === 'morning') {
    return (
      <View style={{ gap: space.md }}>
        <Public>
          <Sun size={24} color={colors.insight} />
          <LastEvent state={state} />
        </Public>
        <Button label={`Start day ${state.round}`} icon={ArrowRight} onPress={() => setStep('day')} />
      </View>
    );
  }

  // Day: the table talks, then agrees on one player to banish.
  return (
    <View style={{ gap: space.md }}>
      <Public>
        <AppText variant="overline" color={colors.insight}>
          Day {state.round}
        </AppText>
        {state.last?.kind === 'banished' ? <LastEvent state={state} /> : null}
        <AppText variant="heading">Talk it out, then vote</AppText>
        <AppText variant="small" color={colors.textBody}>
          Discuss who might be a Traitor. When the table agrees — or by a show of hands — tap the player to banish. Their role is revealed.
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          <Badge label={`${alive.length} still in`} />
        </View>
      </Public>
      {alive.map((i) => (
        <OptionButton
          key={i}
          label={`Banish ${players[i]}`}
          onPress={() => {
            const next = banish(state, i);
            setState(next);
            setNightKey((k) => k + 1);
            setStep(next.phase === 'over' ? 'day' : 'night');
          }}
        />
      ))}
    </View>
  );
}

function LastEvent({ state }: { state: ReturnType<typeof startTraitors> }) {
  const last = state.last;
  if (!last) return null;
  const name = state.players[last.player];
  return (
    <AppText variant="bodyStrong" color={last.role === 'traitor' ? colors.rivalText : colors.text}>
      {last.kind === 'murdered' ? `${name} was removed in the night. They were Faithful.` : `${name} was banished. They were ${last.role === 'traitor' ? 'a Traitor' : 'Faithful'}.`}
    </AppText>
  );
}

// ── Two-Thirds ───────────────────────────────────────────────────────────────

function TwoThirds({ players }: { players: string[] }) {
  const [round, setRound] = useState(1);
  const [totals, setTotals] = useState(() => players.map(() => 0));
  const [last, setLast] = useState<ReturnType<typeof scoreGuesses> | null>(null);
  const order = players.map((_, i) => i);

  if (last) {
    const finished = round >= TWO_THIRDS_ROUNDS;
    return (
      <View style={{ gap: space.md }}>
        <Public>
          <AppText variant="overline" color={colors.insight}>
            Round {round} of {TWO_THIRDS_ROUNDS}
          </AppText>
          <AppText variant="heading">
            Average {last.average.toFixed(1)} → target {last.target.toFixed(1)}
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            Closest: {last.winners.map((i) => `${players[i]} (${last.guesses[i]})`).join(', ')}
          </AppText>
          <View style={{ gap: 2 }}>
            {order
              .slice()
              .sort((a, b) => last.guesses[a] - last.guesses[b])
              .map((i) => (
                <AppText key={i} variant="caption" color={last.winners.includes(i) ? colors.insight : colors.textMuted} tabular>
                  {last.guesses[i]} · {players[i]}
                </AppText>
              ))}
          </View>
        </Public>
        <Scoreboard players={players} totals={totals} unit="pts" />
        {finished ? (
          <End game="two-thirds" />
        ) : (
          <Button
            label={`Round ${round + 1}`}
            icon={ArrowRight}
            onPress={() => {
              setRound(round + 1);
              setLast(null);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <PassAround<number>
      key={round}
      order={order}
      names={players}
      ask={(_p, done) => (
        <View style={styles.secret}>
          <AppText variant="heading">Pick a number from 0 to 100</AppText>
          <AppText variant="small" color={colors.textBody}>
            Closest to two-thirds of everyone’s average scores a point.
          </AppText>
          <NumberPick onDone={done} />
        </View>
      )}
      onAll={(guesses) => {
        const r = scoreGuesses(guesses);
        setTotals((t) => t.map((x, i) => x + (r.winners.includes(i) ? 1 : 0)));
        setLast(r);
      }}
    />
  );
}

// ── The Pot ──────────────────────────────────────────────────────────────────

function Pot({ players }: { players: string[] }) {
  const [round, setRound] = useState(1);
  const [totals, setTotals] = useState(() => players.map(() => 0));
  const [last, setLast] = useState<ReturnType<typeof scorePot> | null>(null);
  const order = players.map((_, i) => i);

  if (last) {
    const finished = round >= POT_ROUNDS;
    const all = last.shared === players.length;
    return (
      <View style={{ gap: space.md }}>
        <Public>
          <AppText variant="overline" color={colors.insight}>
            Round {round} of {POT_ROUNDS}
          </AppText>
          <AppText variant="heading">
            {last.shared} of {players.length} shared
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {all ? `Everyone shared: ${POT_COINS * 2} coins each — the best the table can do.` : last.shared === 0 ? `Nobody shared: ${POT_COINS} coins each. Everyone could have had ${POT_COINS * 2}.` : `Sharers got ${Math.min(...last.payout)}, keepers got ${Math.max(...last.payout)}. Who kept? The phone won’t say.`}
          </AppText>
        </Public>
        <Scoreboard players={players} totals={totals} unit="coins" />
        {finished ? (
          <End game="pot">
            <AppText variant="small" color={colors.textMuted}>
              Keeping always pays you more than sharing, whatever the others do — yet a table of keepers ends up poorest. That’s the cooperation trap.
            </AppText>
          </End>
        ) : (
          <Button
            label={`Round ${round + 1}`}
            icon={ArrowRight}
            onPress={() => {
              setRound(round + 1);
              setLast(null);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <PassAround<boolean>
      key={round}
      order={order}
      names={players}
      ask={(_p, done) => (
        <View style={styles.secret}>
          <AppText variant="heading">Your {POT_COINS} coins</AppText>
          <AppText variant="small" color={colors.textBody}>
            Coins in the pot are doubled and shared equally by everyone. Coins you keep are yours alone.
          </AppText>
          <OptionButton label="Put them in the pot" onPress={() => done(true)} />
          <OptionButton label="Keep them" onPress={() => done(false)} />
        </View>
      )}
      onAll={(shares) => {
        const r = scorePot(shares);
        setTotals((t) => t.map((x, i) => Math.round((x + r.payout[i]) * 10) / 10));
        setLast(r);
      }}
    />
  );
}

const styles = StyleSheet.create({
  handoff: { alignItems: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.xl, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border },
  secret: { gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  public: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(253,186,116,0.3)' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
});
