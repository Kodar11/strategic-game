import { useState } from 'react';
import { View } from 'react-native';

import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Send, X } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type UltAction, type UltRound, type UltState, type UltTerms, ultPrompt } from '@/src/arena/ultimatum-game';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row } from './parts';

/**
 * The pool as one bar: your share in blue, theirs in amber. The ticks mark each side's walk-away value, so you can see
 * whether a split clears what each of you gets by saying no. This is what sets the Arena game apart from the classic.
 */
function PoolBar({ t, mine }: { t: UltTerms; mine: number }) {
  const pct = (x: number) => `${(x / t.pool) * 100}%` as const;
  const walk = t.walkPlayer > 0 || t.walkBot > 0;
  const theirs = t.pool - mine;
  const youClear = mine >= t.walkPlayer;
  const theyClear = theirs >= t.walkBot;
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`You ${mine}, they ${theirs}, of ${t.pool}.${walk ? ` Walk-away: you ${t.walkPlayer}, they ${t.walkBot}.` : ' Rejection leaves both with nothing.'}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="small" weight="semibold" color={colors.primaryText} tabular>
          You {mine}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} tabular>
          pool {t.pool}
        </AppText>
        <AppText variant="small" weight="semibold" color={colors.insight} tabular>
          They {theirs}
        </AppText>
      </Row>
      <View style={{ height: 26, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceHigh }}>
          <View style={{ width: pct(mine), backgroundColor: colors.primary }} />
          <View style={{ flex: 1, backgroundColor: colors.insight, opacity: 0.85 }} />
        </View>
        {t.walkPlayer > 0 ? <View style={{ position: 'absolute', left: pct(t.walkPlayer), width: 3, marginLeft: -1, height: 26, backgroundColor: colors.text }} /> : null}
        {t.walkBot > 0 ? <View style={{ position: 'absolute', right: pct(t.walkBot), width: 3, marginRight: -1, height: 26, backgroundColor: colors.text }} /> : null}
      </View>
      {walk ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="caption" color={youClear ? colors.success : colors.danger} tabular>
            {youClear ? 'clears' : 'below'} your walk-away {t.walkPlayer}
          </AppText>
          <AppText variant="caption" color={theyClear ? colors.success : colors.danger} tabular>
            {theyClear ? 'clears' : 'below'} theirs {t.walkBot}
          </AppText>
        </Row>
      ) : (
        <AppText variant="caption" color={colors.textMuted}>
          If rejected, each of you gets nothing.
        </AppText>
      )}
    </View>
  );
}

function Propose({ t, act }: { t: UltTerms; act: (a: UltAction) => void }) {
  const [offer, setOffer] = useState(Math.round(t.pool * 0.4));
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="overline" color={colors.primaryText}>
        You propose · how many do they get?
      </AppText>
      <PoolBar t={t} mine={t.pool - offer} />
      <Slider value={offer} min={0} max={t.pool} step={1} onChange={setOffer} label="Tokens offered" hideLabel showValue={false} tone="orange" />
      <Button label={`Offer ${offer} of ${t.pool}`} icon={Send} onPress={() => act(offer)} />
    </View>
  );
}

function Respond({ t, offer, act }: { t: UltTerms; offer: number; act: (a: UltAction) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="overline" color={colors.insight}>
        They propose · {offer} for you
      </AppText>
      <PoolBar t={t} mine={offer} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <ChoiceTile compact label="Accept" hint={`You ${offer}, they ${t.pool - offer}`} icon={<Check size={18} color={colors.success} />} tint={colors.success} bg={colors.successSoft} onPress={() => act('accept')} />
        <ChoiceTile compact label="Reject" hint={`You ${t.walkPlayer}, they ${t.walkBot}`} icon={<X size={18} color={colors.rivalText} />} tint={colors.rivalText} bg={colors.rivalSoft} onPress={() => act('reject')} />
      </View>
    </View>
  );
}

function verdict(r: UltRound): string {
  if (r.proposer === 'player') return r.accepted ? `Deal: they took ${r.offer} of ${r.pool}. You +${r.ps}, them +${r.bs}.` : `No deal: they turned down ${r.offer} of ${r.pool}. You +${r.ps}, them +${r.bs}.`;
  return r.accepted ? `Deal: you took ${r.offer} of ${r.pool}. You +${r.ps}, them +${r.bs}.` : `No deal: you turned down ${r.offer} of ${r.pool}. You +${r.ps}, them +${r.bs}.`;
}

export function UltimatumGameBoard({ state, act, over }: BoardProps<UltState, UltAction>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = ultPrompt(state);
  return (
    <View style={{ gap: space.sm }}>
      {last ? <CompactReveal revealKey={h.length} tone={last.accepted ? 'good' : 'bad'} summary={verdict(last)} /> : null}

      {!over && p ? (
        <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.3)', backgroundColor: colors.surface }}>
          {p.terms.proposer === 'player' ? <Propose key={h.length} t={p.terms} act={act} /> : <Respond t={p.terms} offer={p.botOffer!} act={act} />}
        </View>
      ) : null}

      {h.length ? (
        <MatchLog title="Negotiations so far" summary={`${h.filter((r) => r.accepted).length} deals, ${h.filter((r) => !r.accepted).length} rejected`}>
          {h.map((r, i) => (
            <Row key={i} style={{ paddingVertical: 3 }}>
              <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 24 }}>
                R{i + 1}
              </AppText>
              <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {r.proposer === 'player' ? 'You offered' : 'They offered'} {r.offer}/{r.pool}
              </AppText>
              <AppText variant="caption" weight="semibold" color={r.accepted ? colors.success : colors.rivalText}>
                {r.accepted ? 'accepted' : 'rejected'}
              </AppText>
              <AppText variant="caption" tabular color={colors.textMuted} style={{ width: 44, textAlign: 'right' }}>
                {r.ps}–{r.bs}
              </AppText>
            </Row>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}
