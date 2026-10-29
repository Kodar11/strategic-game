import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FlipInXUp } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Hand, KeyRound, Send } from '@/src/components/ui/icons';
import { type Board, type CodeAction, type CodeState, type Key, THEMES, TRAP_PENALTY, type Theme, codePar, codePrompt, codeScore } from '@/src/arena/codebreaker';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Chip, Overline, Panel, Stepper } from './kit';

const KEY_LOOK: Record<Key, { bg: string; border: string; label: string }> = {
  target: { bg: colors.primarySoft, border: colors.primary, label: 'target' },
  trap: { bg: colors.dangerSoft, border: colors.danger, label: 'trap' },
  neutral: { bg: colors.bgRaised, border: colors.border, label: 'neutral' },
};

/** The word grid. `showKey`: the clue-giver's view. `revealed`: words already guessed (their colour shows). */
function Grid({ board, showKey, revealed, onPick }: { board: Board; showKey: boolean; revealed: number[]; onPick?: (i: number) => void }) {
  const reduced = useMotionReduced();
  return (
    <View style={styles.grid}>
      {board.words.map((w, i) => {
        const open = revealed.includes(i);
        const look = showKey || open ? KEY_LOOK[board.key[i]] : null;
        const body = (
          <Animated.View key={`${w}-${open}`} entering={open && !reduced ? FlipInXUp.duration(220) : undefined} style={[styles.word, look && { backgroundColor: look.bg, borderColor: look.border }, open && { borderWidth: 2 }]}>
            <AppText variant="small" weight="semibold" align="center" numberOfLines={1}>
              {w}
            </AppText>
            {look ? (
              <AppText variant="caption" color={colors.textMuted} align="center">
                {look.label}
              </AppText>
            ) : null}
          </Animated.View>
        );
        return onPick && !open ? (
          <Pressable
            key={i}
            style={styles.cell}
            onPress={() => {
              haptic.select();
              onPick(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Guess ${w}`}>
            {body}
          </Pressable>
        ) : (
          <View key={i} style={styles.cell} accessible accessibilityLabel={`${w}${look ? `, ${look.label}` : ''}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

function ClueMaker({ board, onGive }: { board: Board; onGive: (t: Theme, n: number) => void }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [n, setN] = useState(1);
  return (
    <View style={{ gap: space.md }}>
      <Grid board={board} showKey revealed={[]} />
      <Overline>Pick a theme</Overline>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {THEMES.map((t) => (
          <Chip key={t} label={t.toUpperCase()} on={theme === t} onPress={() => setTheme(t)} />
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Stepper value={n} min={1} max={3} onChange={setN} label="How many targets it fits" />
        <Button label={theme ? `${theme.toUpperCase()} · ${n}` : 'Choose a theme'} icon={Send} iconPosition="left" compact disabled={!theme} onPress={() => theme && onGive(theme, n)} />
      </Row>
    </View>
  );
}

export function CodebreakerBoard({ state, act, over, rivalName }: BoardProps<CodeState, CodeAction>) {
  const p = codePrompt(state);
  const last = state.rounds[state.rounds.length - 1];
  const mate = rivalName === 'Your teammate' ? 'your teammate' : rivalName.replace(/^The /, 'the ');
  const go = (a: CodeAction) => {
    haptic.commit();
    act(a);
  };
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} accessible accessibilityLabel={`Team score ${codeScore(state)}; ${codePar(state)} needed.`}>
        <AppText variant="bodyStrong" tabular>
          Team {codeScore(state)} / {codePar(state)}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Round {Math.min(state.rounds.length + 1, state.total)} of {state.total}
        </AppText>
      </View>

      {last ? (
        <Reveal revealKey={state.rounds.length} tone={last.points > 0 ? 'good' : last.points < 0 ? 'bad' : 'plain'} overline={`Round ${state.rounds.length} · ${last.giver === 'bot' ? `${mate}’s clue` : 'your clue'}: ${last.clue.theme.toUpperCase()} ${last.clue.n}`}>
          <Grid board={last.board} showKey revealed={last.guesses} />
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
            {last.guesses.length ? `${last.giver === 'bot' ? 'You' : 'It'} picked ${last.guesses.map((g) => last.board.words[g]).join(', ')}` : 'No guesses'} — {last.points >= 0 ? `+${last.points}` : last.points}.
          </AppText>
        </Reveal>
      ) : null}

      {p && !over ? (
        <Panel accent={p.phase === 'clue' ? 'rgba(37,99,235,0.45)' : 'rgba(253,186,116,0.4)'}>
          <Row>
            <KeyRound size={16} color={p.phase === 'clue' ? colors.primaryText : colors.insight} />
            <Overline color={p.phase === 'clue' ? colors.primaryText : colors.insight}>{p.phase === 'clue' ? 'You give the clue · only you see the key' : `${mate[0].toUpperCase()}${mate.slice(1)} gives the clue`}</Overline>
          </Row>
          {p.phase === 'clue' ? (
            <ClueMaker key={state.rounds.length} board={p.board} onGive={(theme, n) => go({ kind: 'clue', theme, n })} />
          ) : (
            <>
              <View style={styles.clue} accessible accessibilityLabel={`Clue: ${p.clue.theme}, ${p.clue.n}`}>
                <AppText variant="title">{p.clue.theme.toUpperCase()}</AppText>
                <AppText variant="title" color={colors.insight} tabular>
                  {p.clue.n}
                </AppText>
              </View>
              <Grid board={p.board} showKey={false} revealed={p.guesses} onPick={(word) => go({ kind: 'guess', word })} />
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {p.left} guess{p.left === 1 ? '' : 'es'} left · the trap costs {TRAP_PENALTY}
                </AppText>
                <Button label="Stop" variant="secondary" icon={Hand} iconPosition="left" compact disabled={!p.guesses.length} onPress={() => go({ kind: 'stop' })} />
              </Row>
            </>
          )}
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { flexBasis: '31%', flexGrow: 1 },
  word: { minHeight: 56, justifyContent: 'center', padding: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  clue: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: space.md, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: colors.bgRaised },
});
