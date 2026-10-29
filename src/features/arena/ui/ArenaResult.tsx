import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Eye, Gamepad2, Lightbulb, RotateCcw, Sparkles, Trophy } from '@/src/components/ui/icons';
import { ARENA, LEVEL_LABEL } from '@/src/arena/catalog';
import { type ArenaGameId, type Debrief, LEVELS, type Level, type MatchResult, PERSONAS, PERSONA_NAME, type Persona } from '@/src/arena/core';
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
}: {
  game: ArenaGameId;
  result: MatchResult;
  debrief: Debrief;
  persona: Persona;
  level: Level;
  newBest: boolean;
  onPlayAgain: () => void;
  onChange: (next: { persona?: Persona; level?: Level }) => void;
  onLibrary: () => void;
}) {
  const enter = useEnter();
  useEffect(() => haptic.success(), []);
  const g = ARENA[game];
  const win = result.outcome === 'win';
  const hollow = result.outcome === 'draw' && result.note;

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
          {hollow ? 'A hollow win' : HEADLINE[result.outcome]}
        </AppText>
        <AppText variant="bodyStrong" tabular>
          You {result.player} {result.unit} · best rival {result.rival}
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
          vs {PERSONA_NAME[persona]} · {LEVEL_LABEL[level]}
        </AppText>
      </View>

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

      <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <Row>
          <Eye size={16} color={colors.rivalText} />
          <AppText variant="overline" color={colors.rivalText}>
            Opponent revealed
          </AppText>
        </Row>
        <AppText variant="small" color={colors.textBody}>
          {debrief.opponentRead}
        </AppText>
      </View>

      <View style={{ gap: space.md }}>
        <Button label="Play again" icon={RotateCcw} iconPosition="left" onPress={onPlayAgain} />
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Try another opponent
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {PERSONAS.filter((p) => p !== persona).map((p) => {
              const Icon = PERSONA_ICON[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => onChange({ persona: p })}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${PERSONA_NAME[p]}, ${LEVEL_LABEL[level]}`}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceHigh : colors.surface }]}>
                  <Icon size={14} color={colors.rivalText} />
                  <AppText variant="small" color={colors.text}>
                    {PERSONA_NAME[p].replace(/^The /, '')}
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
