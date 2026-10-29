import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { CircleCheck, CircleX, Crosshair, Eye, Gamepad2, Lightbulb, RotateCcw, Shuffle, Sparkles, Trophy } from '@/src/components/ui/icons';
import { ARENA, LEVEL_LABEL, opponentInfo, opponentName } from '@/src/arena/catalog';
import { READ_RULES, type ReadVerdict } from '@/src/arena/reads';
import { type ArenaGameId, type Debrief, LEVELS, type Level, type MatchResult } from '@/src/arena/core';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { PERSONA_ICON, Row } from './parts';

const HEADLINE = { win: 'You won', loss: 'You lost', draw: 'A draw' } as const;

/**
 * The end of an arena match: outcome and score, the standings, a debrief built from this match's own decisions, the
 * opponent's revealed tendencies, and the next step — Play again first, then another opponent or difficulty.
 */
export function ArenaResult({
  game,
  result,
  debrief,
  persona,
  level,
  newBest,
  onPlayAgain,
  onChange,
  onLibrary,
  read,
  reflection,
}: {
  game: ArenaGameId;
  result: MatchResult;
  debrief: Debrief;
  persona: string;
  level: Level;
  newBest: boolean;
  onPlayAgain: () => void;
  onChange: (next: { persona?: string; level?: Level }) => void;
  onLibrary: () => void;
  /** A mystery match's prediction: the guess (null if none) and its verdict. */
  read?: { guess: string | null; verdict: ReadVerdict } | null;
  /** "A thought to take with you", shown just above the next-step controls. */
  reflection?: React.ReactNode;
}) {
  const enter = useEnter();
  useEffect(() => haptic.success(), []);
  const g = ARENA[game];
  const win = result.outcome === 'win';
  const hollow = result.outcome === 'draw' && result.note && !result.headline;
  const team = result.standings.length === 1;

  return (
    <Animated.View entering={enter(0)} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: win ? 'rgba(74,222,128,0.4)' : colors.border, backgroundColor: win ? colors.successSoft : colors.surface }}>
        <Row>
          <Trophy size={20} color={win ? colors.success : colors.textMuted} strokeWidth={2.2} />
          <AppText variant="overline" color={win ? colors.success : colors.textMuted} style={{ flex: 1 }}>
            {g.title} · {debrief.headline}
          </AppText>
          {newBest ? <Badge label="New best" tone="amber" /> : null}
        </Row>
        <AppText variant="title" accessibilityRole="header">
          {result.headline ?? (hollow ? 'A hollow win' : HEADLINE[result.outcome])}
        </AppText>
        <AppText variant="bodyStrong" tabular>
          {team ? `Team score: ${result.player} ${result.unit}` : `You ${result.player} ${result.unit} · ${result.standings.length > 2 ? 'best rival' : 'opponent'} ${result.rival}`}
        </AppText>
        {result.note ? (
          <AppText variant="small" color={colors.insight}>
            {result.note}
          </AppText>
        ) : null}
        {result.standings.length > 2 ? (
          <View style={{ gap: 2, marginTop: space.xs }}>
            {result.standings.map((s, i) => (
              <Row key={s.id}>
                <AppText variant="small" color={colors.textMuted} tabular style={{ width: 20 }}>
                  {i + 1}.
                </AppText>
                <AppText variant="small" weight={s.isPlayer ? 'semibold' : 'regular'} color={s.isPlayer ? colors.primaryText : colors.textBody} style={{ flex: 1 }}>
                  {s.name}
                </AppText>
                <AppText variant="small" tabular>
                  {s.score}
                </AppText>
              </Row>
            ))}
          </View>
        ) : null}
        <AppText variant="caption" color={colors.textMuted}>
          {team ? 'with' : 'vs'} {opponentName(game, persona)} · {LEVEL_LABEL[level]}
        </AppText>
      </View>

      {read ? <PersonalityReveal game={game} persona={persona} read={read} evidence={debrief.opponentRead} /> : null}

      <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.insightSoft, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)' }}>
        <Row>
          <Lightbulb size={18} color={colors.insight} strokeWidth={2.2} />
          <AppText variant="overline" color={colors.insight}>
            Debrief · what happened
          </AppText>
        </Row>
        {debrief.moments.map((m, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <AppText variant="small" color={colors.insight} tabular>
              {i + 1}.
            </AppText>
            <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
              {m}
            </AppText>
          </Row>
        ))}
        <Row style={{ alignItems: 'flex-start', marginTop: space.xs }}>
          <Sparkles size={16} color={colors.insight} />
          <AppText variant="small" weight="semibold" color={colors.text} style={{ flex: 1 }}>
            {debrief.insight}
          </AppText>
        </Row>
      </View>

      {read ? null : (
        <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Row>
            <Eye size={16} color={colors.rivalText} />
            <AppText variant="overline" color={colors.rivalText}>
              {team ? 'Your teammate’s style' : 'Opponent revealed'}
            </AppText>
          </Row>
          <AppText variant="small" color={colors.textBody}>
            {debrief.opponentRead}
          </AppText>
        </View>
      )}

      {reflection}

      <View style={{ gap: space.md }}>
        <Button label={read ? 'Play again · new mystery opponent' : 'Play again'} icon={read ? Shuffle : RotateCcw} iconPosition="left" onPress={onPlayAgain} />
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Try another opponent
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {g.opponents.map((o) => o.id).filter((p) => p !== persona).map((p) => {
              const Icon = PERSONA_ICON[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => onChange({ persona: p })}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${opponentName(game, p)}, ${LEVEL_LABEL[level]}`}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceHigh : colors.surface }]}>
                  <Icon size={14} color={colors.rivalText} />
                  <AppText variant="small" color={colors.text}>
                    {opponentName(game, p).replace(/^The /, '')}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Change difficulty
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {LEVELS.map((l) => (
              <Pressable
                key={l}
                onPress={() => (l === level ? onPlayAgain() : onChange({ level: l }))}
                accessibilityRole="button"
                accessibilityState={{ selected: l === level }}
                accessibilityLabel={`${LEVEL_LABEL[l]} rematch`}
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: l === level ? colors.rival : colors.border, backgroundColor: pressed ? colors.surfaceHigh : l === level ? colors.rivalSoft : colors.surface }]}>
                <AppText variant="small" weight="semibold" color={l === level ? colors.rivalText : colors.text}>
                  {LEVEL_LABEL[l]}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
        <Button label="Game library" variant="ghost" icon={Gamepad2} iconPosition="left" onPress={onLibrary} />
      </View>
    </Animated.View>
  );
}

const VERDICT = {
  correct: { title: 'You read them right', color: colors.success, bg: colors.successSoft, border: 'rgba(74,222,128,0.4)', icon: CircleCheck },
  incorrect: { title: 'Not quite', color: colors.rivalText, bg: colors.rivalSoft, border: 'rgba(249,115,22,0.35)', icon: CircleX },
  unscored: { title: 'Personality revealed', color: colors.textMuted, bg: colors.surface, border: colors.border, icon: Eye },
} as const;

/**
 * The mystery opponent's reveal: who it really was, what the player guessed, the verdict, and the evidence from this
 * match (the engine's debrief, computed from the recorded rounds).
 */
export function PersonalityReveal({ game, persona, read, evidence }: { game: ArenaGameId; persona: string; read: { guess: string | null; verdict: ReadVerdict }; evidence: string }) {
  const v = VERDICT[read.verdict];
  const Icon = v.icon;
  const real = opponentInfo(game, persona);
  const PIcon = PERSONA_ICON[persona] ?? Eye;
  return (
    <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: v.border, backgroundColor: v.bg }} accessibilityLiveRegion="polite">
      <Row>
        <Icon size={18} color={v.color} strokeWidth={2.2} />
        <AppText variant="overline" color={v.color} style={{ flex: 1 }}>
          {v.title}
        </AppText>
      </Row>
      <Row style={{ alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.rivalSoft, alignItems: 'center', justifyContent: 'center' }}>
          <PIcon size={22} color={colors.rivalText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color={colors.textMuted}>
            {READ_RULES[game].target[0].toUpperCase() + READ_RULES[game].target.slice(1)} was
          </AppText>
          <AppText variant="heading">{real?.name ?? persona}</AppText>
        </View>
      </Row>
      <AppText variant="small" color={colors.textBody}>
        {read.guess === null ? 'You didn’t make a guess this time.' : read.verdict === 'correct' ? `You guessed ${opponentName(game, read.guess)} — correct.` : `You guessed ${opponentName(game, read.guess)}.`}
      </AppText>
      <View style={{ gap: 4, paddingTop: space.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Row>
          <Crosshair size={14} color={colors.insight} />
          <AppText variant="overline" color={colors.insight}>
            The evidence
          </AppText>
        </Row>
        <AppText variant="small" color={colors.textBody}>
          {evidence}
        </AppText>
      </View>
    </View>
  );
}
