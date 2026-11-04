import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Send, X } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { ULT_MAX_OFFER, ULT_MIN_OFFER, ULT_PIE, type UltimatumPrompt, type UltimatumRound } from '@/src/games/ultimatum';
import { colors, radius, space } from '@/src/theme/tokens';
import { haptic } from '@/src/utils/feedback';
import type { MatchView } from '../useMatch';
import { RoundTrack, trackDescription } from './parts';

/** Ten coins: `left` for the first side, the rest for the other. Tapping a coin moves the line to it, when `onSet` is given. */
function CoinSplit({ left, leftLabel, rightLabel, leftColor, rightColor, onSet, lost }: { left: number; leftLabel: string; rightLabel: string; leftColor: string; rightColor: string; onSet?: (left: number) => void; lost?: boolean }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', gap: 3, justifyContent: 'center' }} accessible={!onSet} accessibilityLabel={lost ? `All ${ULT_PIE} coins were lost.` : `${leftLabel} ${left} coins, ${rightLabel} ${ULT_PIE - left} coins.`}>
        {Array.from({ length: ULT_PIE }, (_, i) => {
          const coin = (
            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: lost ? 'transparent' : i < left ? leftColor : rightColor, borderWidth: 1.5, borderColor: lost ? colors.textFaint : 'rgba(255,255,255,0.25)', borderStyle: lost ? 'dashed' : 'solid' }}>
              {lost ? <X size={12} color={colors.textFaint} /> : null}
            </View>
          );
          if (!onSet) return <View key={i}>{coin}</View>;
          const target = Math.max(ULT_PIE - ULT_MAX_OFFER, Math.min(ULT_PIE - ULT_MIN_OFFER, i + 1));
          return (
            <Pressable
              key={i}
              onPress={() => {
                haptic.select();
                onSet(target);
              }}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityElementsHidden
              importantForAccessibility="no">
              {coin}
            </Pressable>
          );
        })}
      </View>
      {lost ? null : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="small" weight="semibold" color={leftColor === colors.primary ? colors.primaryText : leftColor} tabular>
            {leftLabel}: {left}
          </AppText>
          <AppText variant="small" weight="semibold" color={rightColor === colors.rival ? colors.rivalText : rightColor} tabular>
            {rightLabel}: {ULT_PIE - left}
          </AppText>
        </View>
      )}
    </View>
  );
}

function verdict(r: UltimatumRound): string {
  if (r.proposer === 'player') return r.accepted ? `They accepted your offer of ${r.offer}. You keep ${r.ps}.` : `They rejected your offer of ${r.offer}. All ${ULT_PIE} coins are gone.`;
  return r.accepted ? `You accepted ${r.offer}. They keep ${r.bs}.` : `You rejected ${r.offer}. All ${ULT_PIE} coins are gone.`;
}

/** Propose by moving the line through ten coins, or answer an offer. A rejection visibly burns the pile. */
export function UltimatumBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as UltimatumRound[];
  const last = rounds[rounds.length - 1];
  const prompt = view.prompt as UltimatumPrompt | null;
  const [offer, setOffer] = useState(4);
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');

  return (
    <View style={{ gap: space.md }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.xs }}>
          <CompactReveal revealKey={rounds.length} tone={last.accepted ? 'plain' : 'bad'} overline={last.accepted ? 'Accepted' : 'Rejected · nobody gets anything'} summary={verdict(last)} />
          {!last.accepted ? <CoinSplit left={0} leftLabel="" rightLabel="" leftColor={colors.primary} rightColor={colors.rival} lost /> : null}
        </View>
      ) : null}

      {prompt?.role === 'propose' ? (
        <View style={{ gap: space.sm }}>
          <View style={{ gap: 2 }}>
            <AppText variant="overline" color={colors.primaryText}>
              You propose
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Offer {ULT_MIN_OFFER}–{ULT_MAX_OFFER} of the {ULT_PIE} coins. Tap a coin or use the slider. If they reject, you both get nothing.
            </AppText>
          </View>
          <CoinSplit left={ULT_PIE - offer} leftLabel="You keep" rightLabel="They get" leftColor={colors.primary} rightColor={colors.rival} onSet={(keep) => setOffer(ULT_PIE - keep)} />
          <Slider label="Coins offered" value={offer} min={ULT_MIN_OFFER} max={ULT_MAX_OFFER} step={1} onChange={setOffer} hideLabel showValue={false} />
          <Button label={`Offer ${offer} coin${offer === 1 ? '' : 's'}`} icon={Send} iconPosition="left" disabled={view.busy} onPress={() => view.play(offer)} />
        </View>
      ) : prompt?.role === 'respond' ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="overline" color={colors.rivalText}>
            Your opponent proposes
          </AppText>
          <AppText variant="heading">
            It offers you {prompt.offer} of {ULT_PIE} coins.
          </AppText>
          <CoinSplit left={prompt.offer} leftLabel="You get" rightLabel="They keep" leftColor={colors.primary} rightColor={colors.rival} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={`Accept ${prompt.offer}`} icon={Check} iconPosition="left" disabled={view.busy} onPress={() => view.play('accept')} style={{ flex: 1 }} />
            <Button label="Reject" variant="secondary" icon={X} iconPosition="left" disabled={view.busy} onPress={() => view.play('reject')} style={{ flex: 1 }} accessibilityHint="Both of you get nothing this round" />
          </View>
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <MatchLog title="Rounds so far" summary={`${rounds.filter((r) => r.accepted).length} deals, ${rounds.filter((r) => !r.accepted).length} rejected`}>
          {rounds.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: colors.surface }} accessible accessibilityLabel={`Round ${i + 1}: ${r.proposer === 'player' ? 'you offered' : 'your opponent offered'} ${r.offer}, ${r.accepted ? 'accepted' : 'rejected'}. You ${r.ps}, opponent ${r.bs}.`}>
              <AppText variant="small" tabular>
                R{i + 1} · {r.proposer === 'player' ? 'you offered' : 'they offered'} {r.offer}
              </AppText>
              <AppText variant="small" weight="semibold" color={r.accepted ? colors.success : colors.rivalText}>
                {r.accepted ? 'accepted' : 'rejected'}
              </AppText>
              <AppText variant="small" tabular color={colors.textMuted}>
                {r.ps} / {r.bs}
              </AppText>
            </View>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}
