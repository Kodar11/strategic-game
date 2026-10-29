import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Eye, Gamepad2, Lightbulb, RotateCcw, Sparkles, Trophy } from '@/src/components/ui/icons';
import { ARENA, LEVEL_LABEL } from '@/src/arena/catalog';
import { LEVELS, type Level, type MatchResult } from '@/src/arena/core';
import { COOP_NAME, type CoopState } from '@/src/arena/cooperation';
import { coopInsights, coopLessons, coopOpponentReveal, coopStats } from '@/src/arena/cooperation-analysis';
import { MatchReflection } from '@/src/features/reflections/ReflectionCard';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import type { ReadVerdict } from '@/src/arena/reads';
import { PersonalityReveal } from './ArenaResult';
import { PERSONA_ICON, Row } from './parts';

const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : '—');

/**
 * The end of a Cooperation Game match. The winner is decided by score alone (equal is a draw); everything else on the
 * screen — counts, rates, the strongest pattern, insights, lessons — is computed from the recorded rounds.
 */
export function CoopResults({ state, result, newBest, onRematch, onChange, onLibrary, read }: { state: CoopState; result: MatchResult; newBest: boolean; onRematch: () => void; onChange: (n: { persona?: string; level?: Level }) => void; onLibrary: () => void; read?: { guess: string | null; verdict: ReadVerdict } | null }) {
  const enter = useEnter();
  useEffect(() => haptic.success(), []);
  const { persona, level } = state.setup;
  const name = COOP_NAME[persona];
  const st = coopStats(state);
  const insights = coopInsights(state, st);
  const lessons = coopLessons(state, st);
  const win = result.outcome === 'win';
  const headline = win ? 'You won' : result.outcome === 'loss' ? `${name} won` : 'A draw';

  return (
    <Animated.View entering={enter(0)} style={{ gap: space.lg }}>
      <View style={[styles.hero, win && { borderColor: 'rgba(74,222,128,0.4)', backgroundColor: colors.successSoft }]}>
        <Row>
          <Trophy size={20} color={win ? colors.success : colors.textMuted} strokeWidth={2.2} />
          <AppText variant="overline" color={win ? colors.success : colors.textMuted} style={{ flex: 1 }}>
            Match over · {st.rounds} rounds · {LEVEL_LABEL[level]}
          </AppText>
          {newBest ? <Badge label="New best" tone="amber" /> : null}
        </Row>
        <AppText variant="title" accessibilityRole="header">
          {headline}
        </AppText>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.primaryText}>
              You
            </AppText>
            <AppText variant="number" tabular>
              {st.player}
            </AppText>
          </View>
          <AppText variant="small" color={colors.textMuted} style={{ paddingBottom: 10 }}>
            {st.diff === 0 ? 'level' : `${st.diff > 0 ? '+' : '−'}${Math.abs(st.diff)}`}
          </AppText>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <AppText variant="caption" color={colors.rivalText} numberOfLines={1}>
              {name.replace(/^The /, '')}
            </AppText>
            <AppText variant="number" tabular>
              {st.bot}
            </AppText>
          </View>
        </Row>
        <AppText variant="caption" color={colors.textMuted}>
          Higher score wins; equal scores draw.
        </AppText>
      </View>

      <View style={styles.grid}>
        <Stat label="Mutual cooperation" value={`${st.mutualC}`} sub="rounds" />
        <Stat label="Mutual defection" value={`${st.mutualD}`} sub="rounds" />
        <Stat label="You were exploited" value={`${st.exploited}`} sub="you C, they D" />
        <Stat label="You took the advantage" value={`${st.exploits}`} sub="you D, they C" />
        <Stat label="Your cooperation" value={pct(st.playerCoop, st.rounds)} sub={`${st.playerCoop} of ${st.rounds} rounds`} />
        <Stat label="Their cooperation" value={pct(st.botCoop, st.rounds)} sub={`${st.botCoop} of ${st.rounds} rounds`} />
      </View>

      <View style={styles.panel}>
        <AppText variant="overline" color={colors.textMuted}>
          Strongest pattern
        </AppText>
        <AppText variant="bodyStrong">{st.pattern}</AppText>
        {st.slips ? (
          <AppText variant="caption" color={colors.insight}>
            {st.slips} round{st.slips === 1 ? '' : 's'} had a slip. Counts use what was delivered.
          </AppText>
        ) : null}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.insightSoft, borderColor: 'rgba(253,186,116,0.35)' }]}>
        <Row>
          <Lightbulb size={18} color={colors.insight} strokeWidth={2.2} />
          <AppText variant="overline" color={colors.insight}>
            How you played
          </AppText>
        </Row>
        {insights.map((t) => (
          <AppText key={t} variant="small" color={colors.textBody}>
            {t}
          </AppText>
        ))}
        {lessons.map((l) => (
          <View key={l.id} style={{ gap: 2, marginTop: space.xs }}>
            <Row>
              <Sparkles size={14} color={colors.insight} />
              <AppText variant="small" weight="semibold" color={colors.text}>
                {l.title}
              </AppText>
            </Row>
            <AppText variant="small" color={colors.textBody}>
              {l.body}
            </AppText>
          </View>
        ))}
      </View>

      {read ? <PersonalityReveal game="cooperation" persona={persona} read={read} evidence={coopOpponentReveal(state)} /> : null}

      <View style={styles.panel}>
        <Row>
          <Eye size={16} color={colors.rivalText} />
          <AppText variant="overline" color={colors.rivalText}>
            Opponent revealed
          </AppText>
        </Row>
        <AppText variant="small" color={colors.textBody}>
          {coopOpponentReveal(state)}
        </AppText>
      </View>

      <MatchReflection game="cooperation" record={state} />

      <View style={{ gap: space.md }}>
        <Button label={read ? 'Rematch · new mystery opponent' : `Rematch ${name}`} icon={RotateCcw} iconPosition="left" onPress={onRematch} />
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Try another personality
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {ARENA.cooperation.opponents
              .filter((o) => o.id !== persona)
              .map((o) => {
                const Icon = PERSONA_ICON[o.id];
                return (
                  <Pressable key={o.id} onPress={() => onChange({ persona: o.id })} accessibilityRole="button" accessibilityLabel={`Play ${o.name}, ${LEVEL_LABEL[level]}`} style={({ pressed }) => [styles.pill, pressed && { backgroundColor: colors.surfaceHigh }]}>
                    <Icon size={14} color={colors.rivalText} />
                    <AppText variant="small" color={colors.text}>
                      {o.name.replace(/^The /, '')}
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
                onPress={() => (l === level ? onRematch() : onChange({ level: l }))}
                accessibilityRole="button"
                accessibilityState={{ selected: l === level }}
                accessibilityLabel={`${LEVEL_LABEL[l]}${l === level ? ', current — rematch' : ''}`}
                style={({ pressed }) => [styles.level, l === level && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }, pressed && { backgroundColor: colors.surfaceHigh }]}>
                <AppText variant="small" weight="semibold" color={l === level ? colors.rivalText : colors.text}>
                  {LEVEL_LABEL[l]}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
        <Button label="Back to Games" variant="ghost" icon={Gamepad2} iconPosition="left" onPress={onLibrary} />
      </View>
    </Animated.View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}, ${sub}`}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="heading" tabular>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textFaint}>
        {sub}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { flexGrow: 1, flexBasis: '46%', minWidth: 130, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border },
  panel: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  level: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
