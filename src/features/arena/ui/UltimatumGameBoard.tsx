import { memo, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Send, X } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type UltAction, type UltRound, type UltState, type UltTerms, ultPrompt } from '@/src/arena/ultimatum-game';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { ActionTile, type BoardProps, Reveal, Row, Stat } from './parts';

/** The pool as tokens: the first `mine` are yours (blue), the rest theirs (amber). */
const TokenPool = memo(function TokenPool({ pool, mine, label }: { pool: number; mine: number; label: string }) {
  return (
    <View style={{ gap: space.xs }} accessible accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', maxWidth: 10 * 27, alignSelf: 'center' }}>
        {Array.from({ length: pool }, (_, i) => (
          <View key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i < mine ? colors.primary : colors.insight, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' }} />
        ))}
      </View>
    </View>
  );
});

function Terms({ t, name }: { t: UltTerms; name: string }) {
  const walk = t.walkPlayer > 0 || t.walkBot > 0;
  return (
    <Row style={{ flexWrap: 'wrap', padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border }}>
      <Stat label="Pool" value={`${t.pool} tokens`} color={colors.insight} />
      <Stat label="Proposer" value={t.proposer === 'player' ? 'You' : name} />
      {walk ? <Stat label="Walk-away · you / them" value={`${t.walkPlayer} / ${t.walkBot}`} /> : <Stat label="If rejected" value="0 each" />}
    </Row>
  );
}

function Propose({ t, act, name }: { t: UltTerms; act: (a: UltAction) => void; name: string }) {
  const [offer, setOffer] = useState(Math.round(t.pool * 0.4));
  const keep = t.pool - offer;
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="overline" color={colors.primaryText}>
        You propose · how many do they get?
      </AppText>
      <TokenPool pool={t.pool} mine={keep} label={`You keep ${keep}, they get ${offer}.`} />
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong" color={colors.primaryText} tabular>
          You keep {keep}
        </AppText>
        <AppText variant="bodyStrong" color={colors.insight} tabular>
          {name.replace(/^The /, '')} gets {offer}
        </AppText>
      </Row>
      <Slider value={offer} min={0} max={t.pool} step={1} onChange={setOffer} label={`Tokens offered to ${name}`} hideLabel showValue={false} tone="orange" />
      <AppText variant="caption" color={colors.textMuted}>
        If {name} rejects, you get {t.walkPlayer} and it gets {t.walkBot}.
      </AppText>
      <Button
        label={`Offer ${offer} of ${t.pool}`}
        icon={Send}
        onPress={() => {
          haptic.commit();
          act(offer);
        }}
      />
    </View>
  );
}

function Respond({ t, offer, act, name }: { t: UltTerms; offer: number; act: (a: UltAction) => void; name: string }) {
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="overline" color={colors.insight}>
        {name} proposes
      </AppText>
      <TokenPool pool={t.pool} mine={offer} label={`${name} offers you ${offer} and keeps ${t.pool - offer}.`} />
      <AppText variant="heading" align="center" tabular>
        {offer} for you · {t.pool - offer} for {name.replace(/^The /, '')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <ActionTile
          label="Accept"
          hint={`You get ${offer}, it gets ${t.pool - offer}`}
          icon={Check}
          tint={colors.success}
          bg={colors.successSoft}
          onPress={() => {
            haptic.commit();
            act('accept');
          }}
        />
        <ActionTile
          label="Reject"
          hint={`You get ${t.walkPlayer}, it gets ${t.walkBot}`}
          icon={X}
          tint={colors.rivalText}
          bg={colors.rivalSoft}
          onPress={() => {
            haptic.commit();
            act('reject');
          }}
        />
      </View>
    </View>
  );
}

function verdict(r: UltRound, name: string): string {
  if (r.proposer === 'player') return r.accepted ? `${name} accepted ${r.offer} of ${r.pool}. You keep ${r.ps}.` : `${name} rejected your offer of ${r.offer}. Walk-aways: you ${r.ps}, it ${r.bs}.`;
  return r.accepted ? `You accepted ${r.offer} of ${r.pool}. ${name} keeps ${r.bs}.` : `You rejected ${r.offer}. Walk-aways: you ${r.ps}, it ${r.bs}.`;
}

export function UltimatumGameBoard({ state, act, over, rivalName }: BoardProps<UltState, UltAction>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = ultPrompt(state);
  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone={last.accepted ? 'good' : 'bad'} overline={`Round ${h.length} · ${last.accepted ? 'Deal' : 'No deal'}`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {verdict(last, rivalName)}
          </AppText>
          <Row>
            <AppText variant="small" color={colors.primaryText} tabular>
              You +{last.ps}
            </AppText>
            <AppText variant="small" color={colors.insight} tabular>
              {rivalName} +{last.bs}
            </AppText>
          </Row>
        </Reveal>
      ) : null}

      {!over && p ? (
        <View style={{ gap: space.md }}>
          <Terms t={p.terms} name={rivalName} />
          {p.terms.proposer === 'player' ? (
            <Propose key={h.length} t={p.terms} act={act} name={rivalName} />
          ) : (
            <Respond t={p.terms} offer={p.botOffer!} act={act} name={rivalName} />
          )}
        </View>
      ) : null}

      {h.length ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Negotiations so far
          </AppText>
          {h.map((r, i) => (
            <Row key={i} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 26 }}>
                R{i + 1}
              </AppText>
              <AppText variant="small" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {r.proposer === 'player' ? 'You offered' : 'They offered'} {r.offer}/{r.pool}
              </AppText>
              <AppText variant="small" weight="semibold" color={r.accepted ? colors.success : colors.rivalText}>
                {r.accepted ? 'accepted' : 'rejected'}
              </AppText>
              <AppText variant="small" tabular color={colors.textMuted} style={{ width: 52, textAlign: 'right' }}>
                {r.ps}–{r.bs}
              </AppText>
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}
