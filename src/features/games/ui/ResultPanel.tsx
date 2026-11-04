import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MatchLog } from '@/src/components/game/MatchLog';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Lightbulb, RotateCcw, Share2, Trophy, UserPlus } from '@/src/components/ui/icons';
import { gamesRepo } from '@/src/data/games-session';
import { GAMES, personality, takeaway } from '@/src/games/catalog';
import { inviteText, resultShareText } from '@/src/games/share-text';
import { sharedOutcome } from '@/src/games/shared-outcome';
import type { SplitRound } from '@/src/games/split-steal';
import type { StagRound } from '@/src/games/stag-hunt';
import { MatchReflection } from '@/src/features/reflections/ReflectionCard';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { challengeLink, inviteFailure, shareResultMessage, shareText } from '../share';
import type { MatchView } from '../useMatch';

/** The shared side of a Split or Steal or Stag Hunt match. Scores and outcomes stay as the engine and server record them. */
function classicShared(view: MatchView, bot: string) {
  if (view.game === 'split-steal') {
    const r = view.rounds as SplitRound[];
    return sharedOutcome({ kind: 'split', you: view.totals.player, them: view.totals.bot, rounds: r.length, joint: r.filter((x) => x.p === 'split' && x.b === 'split').length, jointEach: 5, themName: bot });
  }
  const r = view.rounds as StagRound[];
  return sharedOutcome({ kind: 'hunt', you: view.totals.player, them: view.totals.bot, rounds: r.length, joint: r.filter((x) => x.p === 'stag' && x.b === 'stag').length, jointEach: 5, themName: bot });
}

/**
 * The end of a match: outcome, score, opponent, a takeaway for this game, and Share / Play again / Invite. Inviting
 * creates a friend challenge on the server (same game, opponent and random draws) and shares its link.
 * `detail` goes in the score card (match performance); `insight`, when given, replaces the generic takeaway.
 */
export function ResultPanel({
  view,
  onPlayAgain,
  playAgainLabel = 'Play again',
  detail,
  insight,
  children,
}: {
  view: MatchView;
  onPlayAgain?: () => void;
  playAgainLabel?: string;
  detail?: React.ReactNode;
  insight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const enter = useEnter();
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  useEffect(() => haptic.success(), []);
  const outcome = view.outcome ?? 'draw';
  const g = GAMES[view.game];
  const bot = personality(view.game, view.bot)?.name ?? view.bot;
  const frame = view.game === 'split-steal' || view.game === 'stag-hunt' ? classicShared(view, bot) : null;
  const headline = frame
    ? frame.headline
    : view.game === 'two-thirds'
      ? `${view.totals.player} points · ${view.rounds.length - view.totals.bot} of ${view.rounds.length} rounds won`
      : outcome === 'win'
        ? `You beat ${bot}`
        : outcome === 'loss'
          ? `${bot} won this one`
          : 'A draw';

  const share = async () => {
    const text = resultShareText(view.game, view.bot, view.difficulty, outcome, view.totals);
    setNote(shareResultMessage(await shareText(text), 'result', text));
  };

  const invite = async () => {
    setInviting(true);
    setNote(null);
    try {
      // A friend challenge from a challenge match reuses that challenge, so both compare like for like.
      const token = view.server?.challengeToken ?? (await gamesRepo.createChallenge(view.game, view.bot, view.difficulty)).token;
      const link = challengeLink(token);
      const mine = view.server?.challengeToken ? view.totals.player : null;
      const message = inviteText(view.game, view.bot, view.difficulty, mine);
      setNote(shareResultMessage(await shareText(message, link), 'invite', `${message}\n${link}`) ?? (view.server?.challengeToken ? null : 'Your friend gets their own match. You can play the same challenge from its link too.'));
    } catch (e) {
      setNote(inviteFailure(e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <Animated.View entering={enter(0)} style={{ gap: space.md }}>
      <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: frame?.full || outcome === 'win' ? 'rgba(74,222,128,0.4)' : colors.border, backgroundColor: frame?.full || outcome === 'win' ? colors.successSoft : colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Trophy size={20} color={outcome === 'win' ? colors.success : colors.textMuted} strokeWidth={2.2} />
          <AppText variant="overline" color={outcome === 'win' ? colors.success : colors.textMuted}>
            {g.title} · match over
          </AppText>
        </View>
        <AppText variant="title" accessibilityRole="header">
          {headline}
        </AppText>
        {view.game !== 'two-thirds' ? (
          <AppText variant="bodyStrong" tabular>
            You {view.totals.player} · {bot} {view.totals.bot}
          </AppText>
        ) : null}
        {frame ? (
          <AppText variant="small" color={colors.textBody}>
            {frame.shared} {frame.tradeoff}
          </AppText>
        ) : null}
      </View>

      {insight ?? (
        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.insightSoft, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)' }}>
          <Lightbulb size={18} color={colors.insight} strokeWidth={2.2} />
          <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
            {takeaway(view.game, outcome, view.totals, view.totalRounds)}
          </AppText>
        </View>
      )}

      {children}

      <MatchReflection game={view.game} record={view.rounds} />

      <View style={{ gap: space.sm }}>
        {detail ? <MatchLog title="Round by round" summary={`${view.rounds.length} rounds`}>{detail}</MatchLog> : null}
        {onPlayAgain ? <Button label={playAgainLabel} icon={RotateCcw} iconPosition="left" onPress={onPlayAgain} /> : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Share result" variant="secondary" icon={Share2} iconPosition="left" compact onPress={() => void share()} style={{ flex: 1 }} />
          <Button label={inviting ? 'Creating…' : 'Invite a friend'} variant="secondary" icon={UserPlus} iconPosition="left" compact disabled={inviting} onPress={() => void invite()} style={{ flex: 1 }} />
        </View>
        {note ? (
          <AppText variant="small" color={colors.textMuted} selectable accessibilityLiveRegion="polite">
            {note}
          </AppText>
        ) : null}
      </View>
    </Animated.View>
  );
}
