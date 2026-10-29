import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { CircleCheck, CircleX, Crosshair, Hand, HandFist, Lightbulb, type LucideIcon, Scissors, Target } from '@/src/components/ui/icons';
import { DIFFICULTY_LABEL, personality } from '@/src/games/catalog';
import { RPS_INSIGHT, type RpsBot, type RpsMove, type RpsRound } from '@/src/games/rps';
import { type OpponentRead, matchReveal } from '@/src/games/rps-insight';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { Panel } from './parts';

const ICON: Record<RpsMove, LucideIcon> = { rock: HandFist, paper: Hand, scissors: Scissors };
const LABEL: Record<RpsMove, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const RESULT = { 1: 'won', 0: 'tie', [-1]: 'lost' } as const;

/** Match performance, round by round: your throw over the bot's, coloured by who took the round. */
export function RpsRounds({ rounds }: { rounds: RpsRound[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {rounds.map((r, i) => {
        const tint = r.r === 1 ? colors.success : r.r === -1 ? colors.rivalText : colors.textMuted;
        const P = ICON[r.p];
        const B = ICON[r.b];
        return (
          <View
            key={i}
            accessible
            accessibilityLabel={`Round ${i + 1}: you ${LABEL[r.p]}, bot ${LABEL[r.b]}, ${RESULT[r.r]}.`}
            style={{ width: 34, alignItems: 'center', gap: 2, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: tint }}>
            <AppText variant="caption" color={colors.textMuted} style={{ fontSize: 10, lineHeight: 12 }}>
              {i + 1}
            </AppText>
            <P size={14} color={colors.primaryText} />
            <B size={14} color={colors.rivalText} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * The insight half of a Rock, Paper, Scissors result, kept apart from match points: who the opponent was, how the
 * read went and the Insight Points it earned, evidence from the recorded throws, and one takeaway.
 */
export function RpsReveal({ view, onPractise }: { view: MatchView; onPractise?: (bot: RpsBot) => void }) {
  const reveal = matchReveal({
    bot: view.bot as RpsBot,
    difficulty: view.difficulty,
    mode: view.opponent,
    rounds: view.rounds as RpsRound[],
    // lockRead only accepts this game's bots, so a Rock, Paper, Scissors read names an RpsBot.
    read: (view.read?.current ?? null) as OpponentRead | null,
  });
  if (!reveal) return null;
  const guessName = reveal.read ? personality('rps', reveal.read.guess)?.name : null;

  return (
    <Panel tone="insight">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Lightbulb size={18} color={colors.insight} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.insight}>
          Insight · separate from match points
        </AppText>
      </View>
      <AppText variant="bodyStrong" accessibilityRole="header">
        {reveal.mode === 'mystery' ? 'Revealed: ' : 'Opponent: '}
        {reveal.name} · {DIFFICULTY_LABEL[reveal.difficulty]}
      </AppText>

      {reveal.mode === 'mystery' ? (
        reveal.insight ? (
          <View style={{ flexDirection: 'row', gap: space.sm }} accessible>
            {reveal.insight.correct ? <CircleCheck size={18} color={colors.success} /> : <CircleX size={18} color={colors.textMuted} />}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="small" weight="semibold" color={reveal.insight.correct ? colors.success : colors.textBody}>
                {reveal.insight.correct ? `Your read was right. +${reveal.insight.points} Insight Points` : `You read ${guessName}. Not this time — no points lost.`}
              </AppText>
              {reveal.guessFit ? (
                <AppText variant="small" color={colors.textBody}>
                  {guessName}’s rule would have matched {reveal.guessFit.hits} of {reveal.guessFit.chances} of its throws.
                  {reveal.guessFit.hits * 2 >= reveal.guessFit.chances ? ' Two rules can call the same throw when you repeat yourself — vary your throws to tell them apart.' : ''}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Crosshair size={18} color={colors.textMuted} />
            <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
              No read this time. Next match, name its habit after round {RPS_INSIGHT.minRounds} for +{RPS_INSIGHT.points} Insight Points.
            </AppText>
          </View>
        )
      ) : null}

      <View style={{ gap: space.xs }}>
        <AppText variant="caption" color={colors.textMuted}>
          What its throws show
        </AppText>
        {reveal.evidence.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
            <AppText variant="small" color={colors.textMuted}>
              •
            </AppText>
            <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
              {e}
            </AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Target size={18} color={colors.insight} />
        <AppText variant="small" weight="semibold" color={colors.text} style={{ flex: 1 }}>
          {reveal.takeaway}
        </AppText>
      </View>

      {onPractise ? <Button label={`Practise vs ${reveal.name}`} variant="secondary" compact icon={Target} iconPosition="left" onPress={() => onPractise(reveal.bot)} /> : null}
    </Panel>
  );
}
