import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Send, X } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { ULT_MAX_OFFER, ULT_MIN_OFFER, ULT_PIE, type UltimatumPrompt, type UltimatumRound } from '@/src/games/ultimatum';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { FadeInView } from './common';
import { Panel, RoundTrack, trackDescription } from './parts';

/** Ten coins: `left` for the first side, the rest for the other. */
function CoinSplit({ left, leftLabel, rightLabel, leftColor, rightColor }: { left: number; leftLabel: string; rightLabel: string; leftColor: string; rightColor: string }) {
  return (
    <View style={{ gap: space.xs }} accessible accessibilityLabel={`${leftLabel} ${left} coins, ${rightLabel} ${ULT_PIE - left} coins.`}>
      <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center' }}>
        {Array.from({ length: ULT_PIE }, (_, i) => (
          <View key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i < left ? leftColor : rightColor, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="small" weight="semibold" color={leftColor} tabular>
          {leftLabel}: {left}
        </AppText>
        <AppText variant="small" weight="semibold" color={rightColor} tabular>
          {rightLabel}: {ULT_PIE - left}
        </AppText>
      </View>
    </View>
  );
}

function verdict(r: UltimatumRound): string {
  if (r.proposer === 'player') return r.accepted ? `The bot accepted your offer of ${r.offer}. You keep ${r.ps}.` : `The bot rejected your offer of ${r.offer}. Nobody gets anything this round.`;
  return r.accepted ? `You accepted ${r.offer}. The bot keeps ${r.bs}.` : `You rejected ${r.offer}. Nobody gets anything this round.`;
}

/** Propose with a coin split, or answer the bot's offer; every result shows who got what. */
export function UltimatumBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as UltimatumRound[];
  const last = rounds[rounds.length - 1];
  const prompt = view.prompt as UltimatumPrompt | null;
  const [offer, setOffer] = useState(4);
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');

  return (
    <View style={{ gap: space.lg }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <FadeInView revealKey={rounds.length}>
          <Panel tone={last.accepted ? 'plain' : 'insight'}>
            <AppText variant="overline" color={last.accepted ? colors.success : colors.rivalText}>
              {last.accepted ? 'Accepted' : 'Rejected'}
            </AppText>
            <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
              {verdict(last)}
            </AppText>
          </Panel>
        </FadeInView>
      ) : null}

      {prompt?.role === 'propose' ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <AppText variant="overline" color={colors.primaryText}>
              You propose
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Offer the bot {ULT_MIN_OFFER}–{ULT_MAX_OFFER} of the {ULT_PIE} coins. If it rejects, you both get nothing.
            </AppText>
          </View>
          <CoinSplit left={ULT_PIE - offer} leftLabel="You keep" rightLabel="Bot gets" leftColor={colors.primary} rightColor={colors.insight} />
          <Slider label="Coins offered to the bot" value={offer} min={ULT_MIN_OFFER} max={ULT_MAX_OFFER} step={1} onChange={setOffer} />
          <Button label={`Offer ${offer} coin${offer === 1 ? '' : 's'}`} icon={Send} iconPosition="left" disabled={view.busy} onPress={() => view.play(offer)} />
        </View>
      ) : prompt?.role === 'respond' ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <AppText variant="overline" color={colors.rivalText}>
              The bot proposes
            </AppText>
            <AppText variant="heading">It offers you {prompt.offer} of {ULT_PIE} coins.</AppText>
          </View>
          <CoinSplit left={prompt.offer} leftLabel="You get" rightLabel="Bot keeps" leftColor={colors.primary} rightColor={colors.rival} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label={`Accept ${prompt.offer}`} icon={Check} iconPosition="left" disabled={view.busy} onPress={() => view.play('accept')} style={{ flex: 1 }} />
            <Button label="Reject" variant="secondary" icon={X} iconPosition="left" disabled={view.busy} onPress={() => view.play('reject')} style={{ flex: 1 }} accessibilityHint="Both of you get nothing this round" />
          </View>
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Rounds so far
          </AppText>
          {rounds.map((r, i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: colors.bgRaised }}
              accessible
              accessibilityLabel={`Round ${i + 1}: ${r.proposer === 'player' ? 'you offered' : 'the bot offered'} ${r.offer}, ${r.accepted ? 'accepted' : 'rejected'}. You ${r.ps}, bot ${r.bs}.`}>
              <AppText variant="small" tabular>
                R{i + 1} · {r.proposer === 'player' ? 'you offered' : 'bot offered'} {r.offer}
              </AppText>
              <AppText variant="small" weight="semibold" color={r.accepted ? colors.success : colors.rivalText}>
                {r.accepted ? 'accepted' : 'rejected'}
              </AppText>
              <AppText variant="small" tabular color={colors.textMuted}>
                {r.ps} / {r.bs}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
