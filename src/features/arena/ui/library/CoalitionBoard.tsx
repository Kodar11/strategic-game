import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Check, Vote, X } from '@/src/components/ui/icons';
import { type CoalitionAction, type CoalitionState, MAJORITY, PRIZE, type Proposal, coalitionPrompt, partyName, proportional, seatsOf } from '@/src/arena/coalition';
import { haptic } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, fonts, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row } from '../parts';
import { Chip, Overline, Panel, Stepper } from './kit';

const PARTY_TINT = [colors.primary, colors.rival, '#94A3B8', '#22D3EE'];
const SEATS = 100;
const ROWS_ = 5;

/** Seat positions on a hemicycle, left to right: the seat order fills blocs from the left. */
function seatPositions(width: number) {
  const cx = width / 2;
  const cy = width / 2 - 2;
  const inner = width * 0.2;
  const outer = width / 2 - 6;
  const rings = Array.from({ length: ROWS_ }, (_, i) => inner + ((outer - inner) * i) / (ROWS_ - 1));
  const total = rings.reduce((a, b) => a + b, 0);
  const seats: { x: number; y: number; a: number }[] = [];
  rings.forEach((r) => {
    const n = Math.round((SEATS * r) / total);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1 - (i + 0.5) / n);
      seats.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), a });
    }
  });
  return seats
    .sort((p, q) => q.a - p.a)
    .slice(0, SEATS);
}

/**
 * The chamber: 100 seats, each party a wedge. Parties in the bloc (the bill's members) are lit, the others dim; the
 * needle marks the seat a majority has to reach.
 */
function Chamber({ s, members }: { s: CoalitionState; members: readonly number[] }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - space.lg * 2 - space.md * 2, MAX_CONTENT_WIDTH - 64, 300);
  const seats = seatPositions(w);
  // The bloc sits together from the left, so its size against the 51 line reads at a glance.
  const order = [...[0, 1, 2, 3].filter((p) => members.includes(p)), ...[0, 1, 2, 3].filter((p) => !members.includes(p))];
  const owner: number[] = [];
  for (const p of order) for (let k = 0; k < s.weights[p]; k++) owner.push(p);
  const total = seatsOf(s, members);
  const a = Math.PI * (1 - MAJORITY / SEATS);
  const cx = w / 2;
  const cy = w / 2 - 2;
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Chamber of 100 seats. ${[0, 1, 2, 3].map((p) => `${partyName(p)} ${s.weights[p]}`).join(', ')}. ${members.length ? `This bloc holds ${total}; a majority is ${MAJORITY}.` : `A majority is ${MAJORITY}.`}`}>
      <Svg width={w} height={w / 2 + 6}>
        {seats.map((seat, i) => {
          const p = owner[i] ?? 0;
          const lit = !members.length || members.includes(p);
          return <Circle key={i} cx={seat.x} cy={seat.y} r={w / 62} fill={PARTY_TINT[p]} opacity={lit ? 1 : 0.28} />;
        })}
        <Line x1={cx + w * 0.14 * Math.cos(a)} y1={cy - w * 0.14 * Math.sin(a)} x2={cx + (w / 2) * Math.cos(a)} y2={cy - (w / 2) * Math.sin(a)} stroke={colors.insight} strokeWidth={2} />
        <SvgText x={cx} y={cy - 4} textAnchor="middle" fill={total >= MAJORITY ? colors.success : colors.text} fontSize={20} fontFamily={fonts.bold}>
          {members.length ? String(total) : String(MAJORITY)}
        </SvgText>
        <SvgText x={cx} y={cy - 26} textAnchor="middle" fill={colors.textMuted} fontSize={10} fontFamily={fonts.medium}>
          {members.length ? `of ${MAJORITY} needed` : 'to pass'}
        </SvgText>
      </Svg>
    </View>
  );
}

/** One row per party: seats, points so far and, when a bill is up, its share. */
function Table({ s, bill }: { s: CoalitionState; bill: Proposal | null }) {
  return (
    <View style={{ gap: 2 }}>
      {[0, 1, 2, 3].map((i) => {
        const inBill = bill?.members.includes(i);
        return (
          <Row key={i} style={[styles.party, inBill && { borderColor: colors.insight, backgroundColor: colors.insightSoft }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PARTY_TINT[i] }} />
            <AppText variant="caption" weight="semibold" color={i === 0 ? colors.primaryText : i === 1 ? colors.rivalText : colors.text} style={{ flex: 1 }} numberOfLines={1}>
              {partyName(i)}
              {i === 1 ? ' · your rival' : ''}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {s.weights[i]} seats · {s.points[i]} pts
            </AppText>
            {bill && inBill ? (
              <AppText variant="small" weight="bold" tabular color={colors.insight} style={{ width: 24, textAlign: 'right' }}>
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
  return (
    <View style={{ gap: space.sm }}>
      <Chamber s={s} members={members} />
      <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
        {[1, 2, 3].map((m) => (
          <Chip key={m} label={`${partyName(m)} ${s.weights[m]}`} on={partners.includes(m)} onPress={() => toggle(m)} tint={colors.insight} a11y={`${partyName(m)}, ${s.weights[m]} seats`} />
        ))}
      </Row>
      {partners.map((m) => (
        <Row key={m} style={{ justifyContent: 'space-between' }}>
          <AppText variant="small" style={{ flex: 1 }}>
            Offer {partyName(m)}
          </AppText>
          <Stepper value={offers[m] ?? 0} min={0} max={PRIZE} onChange={(v) => setOffers({ ...offers, [m]: v })} label={`Points offered to ${partyName(m)}`} />
        </Row>
      ))}
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="small" weight="semibold" color={keep < 0 ? colors.danger : colors.primaryText}>
          You keep {keep} of {PRIZE}
        </AppText>
        <Button
          label={seats >= MAJORITY ? 'Table the bill' : `Need ${MAJORITY - seats} more`}
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

/** Bills passed together: how often each party has sided with each other, from the public record. */
function AllianceGrid({ s }: { s: CoalitionState }) {
  const together = (a: number, b: number) => s.rounds.filter((r) => r.passed && r.proposal.members.includes(a) && r.proposal.members.includes(b)).length;
  const P = [0, 1, 2, 3];
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`Bills passed together: ${P.flatMap((a) => P.filter((b) => b > a).map((b) => `${partyName(a)} and ${partyName(b)} ${together(a, b)}`)).join(', ')}.`}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 52 }} />
        {P.map((b) => (
          <AppText key={b} variant="caption" color={colors.textMuted} align="center" style={{ flex: 1 }} numberOfLines={1}>
            {partyName(b)}
          </AppText>
        ))}
      </View>
      {P.map((a) => (
        <View key={a} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <AppText variant="caption" color={colors.textMuted} style={{ width: 52 }} numberOfLines={1}>
            {partyName(a)}
          </AppText>
          {P.map((b) => {
            const n = a === b ? null : together(a, b);
            return (
              <View key={b} style={{ flex: 1, height: 24, margin: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: n ? `rgba(253,186,116,${Math.min(0.15 + n * 0.14, 0.8)})` : colors.surface }}>
                <AppText variant="caption" tabular color={n ? colors.text : colors.textFaint}>
                  {n === null ? '' : n}
                </AppText>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function CoalitionBoard({ state, act, over }: BoardProps<CoalitionState, CoalitionAction>) {
  const p = coalitionPrompt(state);
  const h = state.rounds;
  const last = h[h.length - 1];
  return (
    <View style={{ gap: space.sm }}>
      {last ? (
        <CompactReveal revealKey={h.length} tone={last.passed ? (last.proposal.members.includes(0) ? 'good' : 'plain') : 'bad'} overline={`Round ${h.length} · ${partyName(last.proposal.proposer)}’s bill`} summary={last.passed ? `Passed: ${last.proposal.members.map((m) => `${partyName(m)} ${last.proposal.shares[m]}`).join(' · ')}` : 'The bill failed. Nobody gets anything this round.'}>
          {last.responses.some((r) => r !== null) ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {last.responses.map((r, i) =>
                r === null ? null : (
                  <Row key={i} style={{ gap: 4 }}>
                    {r ? <Check size={14} color={colors.success} /> : <X size={14} color={colors.danger} />}
                    <AppText variant="caption" color={colors.textBody}>
                      {partyName(i)} {r ? 'yes' : 'no'}
                    </AppText>
                  </Row>
                ),
              )}
            </Row>
          ) : null}
        </CompactReveal>
      ) : null}

      {p && !over ? (
        <Panel accent="rgba(253,186,116,0.35)" style={{ padding: space.md, gap: space.sm }}>
          <Overline color={colors.insight}>{p.phase === 'propose' ? 'You propose · pick partners, split 12' : `${partyName((p as { proposal: Proposal }).proposal.proposer)} proposes`}</Overline>
          {p.phase === 'propose' ? (
            <Builder key={h.length} s={state} act={act} />
          ) : (
            <>
              <Chamber s={state} members={p.proposal.members} />
              <Table s={state} bill={p.proposal} />
              {p.phase === 'respond' ? (
                <>
                  <AppText variant="small" weight="semibold">
                    You’re offered {p.proposal.shares[0]} of {PRIZE}. Your seat share would be {Math.round(proportional(state, p.proposal.members, 0) * 10) / 10}.
                  </AppText>
                  <Row>
                    <Button label="Reject" variant="secondary" icon={X} iconPosition="left" onPress={() => act({ kind: 'respond', accept: false })} style={{ flex: 1 }} />
                    <Button label="Accept" icon={Check} iconPosition="left" onPress={() => act({ kind: 'respond', accept: true })} style={{ flex: 1 }} />
                  </Row>
                </>
              ) : (
                <Button label="You’re not in this bloc. See the vote" icon={ArrowRight} onPress={() => act({ kind: 'watch' })} />
              )}
            </>
          )}
        </Panel>
      ) : (
        <Table s={state} bill={null} />
      )}

      <MatchLog title="Parties and alliances" summary={`You ${state.points[0]} pts · ${h.filter((r) => r.passed).length} of ${h.length} bills passed`}>
        {p && !over && p.phase === 'propose' ? <Table s={state} bill={null} /> : null}
        {h.length ? <AllianceGrid s={state} /> : null}
        {h.map((r, i) => (
          <AppText key={i} variant="caption" color={r.passed ? colors.textBody : colors.textMuted}>
            {i + 1}. {partyName(r.proposal.proposer)}: {r.proposal.members.map((m) => `${partyName(m)} ${r.proposal.shares[m]}`).join(', ')} · {r.passed ? 'passed' : 'failed'}
          </AppText>
        ))}
      </MatchLog>
    </View>
  );
}

const styles = StyleSheet.create({
  party: { paddingHorizontal: space.sm, minHeight: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
