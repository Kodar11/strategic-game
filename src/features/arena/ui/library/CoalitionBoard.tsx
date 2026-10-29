import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Check, Vote, X } from '@/src/components/ui/icons';
import { type CoalitionAction, type CoalitionState, MAJORITY, PRIZE, type Proposal, coalitionPrompt, partyName, proportional, seatsOf } from '@/src/arena/coalition';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Reveal, Row } from '../parts';
import { Avatar, Chip, Overline, Panel, Stepper } from './kit';

/** The four parties, their seats and points; members of `bill` highlighted with their share. */
function Table({ s, bill }: { s: CoalitionState; bill: Proposal | null }) {
  return (
    <View style={{ gap: space.xs }}>
      {[0, 1, 2, 3].map((i) => {
        const inBill = bill?.members.includes(i);
        return (
          <Row key={i} style={[styles.party, inBill && { borderColor: colors.insight, backgroundColor: colors.insightSoft }]}>
            <Avatar name={partyName(i)} size={30} seat={i} />
            <View style={{ flex: 1, gap: 4 }}>
              <Row>
                <AppText variant="small" weight="semibold" color={i === 0 ? colors.primaryText : i === 1 ? colors.rivalText : colors.text} style={{ flex: 1 }}>
                  {partyName(i)}
                  {i === 1 ? ' · your rival' : ''}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} tabular>
                  {s.weights[i]} seats · {s.points[i]} pts
                </AppText>
              </Row>
              <AnimatedBar ratio={s.weights[i] / 34} color={i === 0 ? colors.primary : colors.slateDot} height={6} />
            </View>
            {bill && inBill ? (
              <AppText variant="bodyStrong" tabular color={colors.insight} style={{ width: 34, textAlign: 'right' }}>
                {bill.shares[i]}
              </AppText>
            ) : null}
          </Row>
        );
      })}
    </View>
  );
}

function Builder({ s, act }: { s: CoalitionState; act: (a: CoalitionAction) => void }) {
  const [partners, setPartners] = useState<number[]>([]);
  const [offers, setOffers] = useState<Record<number, number>>({});
  const members = [0, ...partners].sort();
  const seats = seatsOf(s, members);
  const given = partners.reduce((t, m) => t + (offers[m] ?? 0), 0);
  const keep = PRIZE - given;
  const toggle = (m: number) => {
    const on = partners.includes(m);
    const next = on ? partners.filter((x) => x !== m) : [...partners, m];
    setPartners(next);
    if (!on && offers[m] === undefined) setOffers({ ...offers, [m]: Math.round(proportional(s, [0, ...next], m)) });
  };
  const shares = [0, 1, 2, 3].map((i) => (i === 0 ? keep : partners.includes(i) ? (offers[i] ?? 0) : 0));
  const ok = partners.length > 0 && seats >= MAJORITY && keep >= 0;
  const bill: Proposal = { proposer: 0, members, shares };
  return (
    <View style={{ gap: space.md }}>
      <Table s={s} bill={partners.length ? bill : null} />
      <Overline>Invite partners</Overline>
      <Row style={{ flexWrap: 'wrap' }}>
        {[1, 2, 3].map((m) => (
          <Chip key={m} label={`${partyName(m)} · ${s.weights[m]}`} on={partners.includes(m)} onPress={() => toggle(m)} tint={colors.insight} a11y={`${partyName(m)}, ${s.weights[m]} seats`} />
        ))}
      </Row>
      <View style={{ gap: 4 }} accessible accessibilityLabel={`Your coalition holds ${seats} of ${MAJORITY} seats needed.`}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="caption" color={seats >= MAJORITY ? colors.success : colors.textMuted}>
            {seats} seats {seats >= MAJORITY ? '· majority' : `· need ${MAJORITY}`}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            proportional split shown as a start
          </AppText>
        </Row>
        <AnimatedBar ratio={seats / 100} color={seats >= MAJORITY ? colors.success : colors.rival} height={8} />
      </View>
      {partners.map((m) => (
        <Row key={m} style={{ justifyContent: 'space-between' }}>
          <AppText variant="small" style={{ flex: 1 }}>
            Offer {partyName(m)}
          </AppText>
          <Stepper value={offers[m] ?? 0} min={0} max={PRIZE} onChange={(v) => setOffers({ ...offers, [m]: v })} label={`Points offered to ${partyName(m)}`} />
        </Row>
      ))}
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong" color={keep < 0 ? colors.danger : colors.primaryText}>
          You keep {keep} of {PRIZE}
        </AppText>
        <Button
          label="Table the bill"
          icon={Vote}
          iconPosition="left"
          compact
          disabled={!ok}
          onPress={() => {
            haptic.commit();
            act({ kind: 'propose', members, shares });
          }}
        />
      </Row>
    </View>
  );
}

export function CoalitionBoard({ state, act, over }: BoardProps<CoalitionState, CoalitionAction>) {
  const p = coalitionPrompt(state);
  const h = state.rounds;
  const last = h[h.length - 1];
  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone={last.passed ? (last.proposal.members.includes(0) ? 'good' : 'plain') : 'bad'} overline={`Round ${h.length} · ${partyName(last.proposal.proposer)}’s bill`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {last.passed ? `Passed: ${last.proposal.members.map((m) => `${partyName(m)} ${last.proposal.shares[m]}`).join(' · ')}` : 'The bill failed — nobody gets anything this round.'}
          </AppText>
          {last.responses.some((r) => r !== null) ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {last.responses.map((r, i) =>
                r === null ? null : (
                  <Row key={i} style={{ gap: 4 }}>
                    {r ? <Check size={14} color={colors.success} /> : <X size={14} color={colors.danger} />}
                    <AppText variant="small" color={colors.textBody}>
                      {partyName(i)} {r ? 'yes' : 'no'}
                    </AppText>
                  </Row>
                ),
              )}
            </Row>
          ) : null}
        </Reveal>
      ) : null}

      {p && !over ? (
        <Panel accent="rgba(253,186,116,0.35)">
          <Overline color={colors.insight}>
            Round {p.round} of {state.total} · {p.phase === 'propose' ? 'you propose' : `${partyName((p as { proposal: Proposal }).proposal.proposer)} proposes`}
          </Overline>
          {p.phase === 'propose' ? (
            <Builder key={h.length} s={state} act={act} />
          ) : (
            <>
              <Table s={state} bill={p.proposal} />
              {p.phase === 'respond' ? (
                <>
                  <AppText variant="bodyStrong">
                    You’re offered {p.proposal.shares[0]} of {PRIZE}. Your seat-proportional share would be {Math.round(proportional(state, p.proposal.members, 0) * 10) / 10}.
                  </AppText>
                  <Row>
                    <Button label="Reject" variant="secondary" icon={X} iconPosition="left" onPress={() => act({ kind: 'respond', accept: false })} style={{ flex: 1 }} />
                    <Button label="Accept" icon={Check} iconPosition="left" onPress={() => act({ kind: 'respond', accept: true })} style={{ flex: 1 }} />
                  </Row>
                </>
              ) : (
                <>
                  <AppText variant="small" color={colors.textBody}>
                    You’re not in this coalition. Its members vote now.
                  </AppText>
                  <Button label="See the vote" icon={ArrowRight} onPress={() => act({ kind: 'watch' })} />
                </>
              )}
            </>
          )}
        </Panel>
      ) : (
        <Table s={state} bill={null} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  party: { padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
