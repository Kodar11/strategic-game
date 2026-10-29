import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { ARENA } from '@/src/arena/catalog';
import { Portrait } from '@/src/components/characters/Portrait';
import type { Expression } from '@/src/components/characters/cast';
import { AnimatedNumber } from '@/src/components/lesson/AnimatedNumber';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge, Card } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowRight, ChevronDown, HandCoins, Handshake, Lightbulb, Lock, RotateCcw, UserRound } from '@/src/components/ui/icons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import {
  MOVE_LABEL,
  type Move,
  type Round,
  alternatives,
  explainOutcome,
  mayaDominantMove,
  mayaReasoning,
  mayaSummary,
  outcomeRows,
} from '../dilemma';

const MOVE_ICON = { share: Handshake, take: HandCoins } as const;
const PAST: Record<Move, string> = { share: 'Shared', take: 'Took' };

// ── Stage 2: the decision ────────────────────────────────────────────────────

/** The dilemma: who Maya is, the rules, and the two choices. Maya's move is already sealed and never shown here. */
export function DilemmaStage({ round, onPick, onLockIn }: { round: Extract<Round, { phase: 'choosing' }>; onPick: (m: Move) => void; onLockIn: () => void }) {
  const enter = useEnter();
  const choice = round.pick;
  return (
    <>
      <Animated.View entering={enter(0)} style={{ gap: space.xs }}>
        <AppText variant="overline" color={colors.insight}>
          Your first decision
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          Share or take?
        </AppText>
        <AppText color={colors.textMuted}>You and Maya each choose in secret. Then both choices are revealed.</AppText>
      </Animated.View>

      <Animated.View entering={enter(60)} style={styles.opponent}>
        <Portrait character="maya" expression={choice ? 'thinking' : 'confident'} size={68} ring={colors.rival} />
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText variant="heading">Maya</AppText>
          <AppText variant="small" color={colors.textMuted}>
            Plays for her own coins. You meet only this once.
          </AppText>
          <View style={styles.sealed} accessible accessibilityLabel="Maya has already chosen. Her choice is hidden until you lock in yours.">
            <Lock size={13} color={colors.rivalText} strokeWidth={2.4} />
            <AppText variant="caption" color={colors.rivalText}>
              Choice sealed
            </AppText>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={enter(120)}>
        <PayoffTable />
      </Animated.View>

      <Animated.View entering={enter(180)} style={{ gap: space.md }}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Your choice" style={styles.choices}>
          <ChoiceCard title="Share" description="3 each if Maya shares too. 0 if she takes." icon={Handshake} selected={choice === 'share'} onSelect={() => onPick('share')} />
          <ChoiceCard title="Take" tone="orange" description="5 if Maya shares. 1 if she takes too." icon={HandCoins} selected={choice === 'take'} onSelect={() => onPick('take')} />
        </View>
        <Button
          label={choice ? `Lock in “${MOVE_LABEL[choice]}”` : 'Pick share or take'}
          icon={Lock}
          iconPosition="left"
          disabled={!choice}
          accessibilityHint="Reveals both choices"
          onPress={() => {
            haptic.commit();
            onLockIn();
          }}
        />
      </Animated.View>
    </>
  );
}

/** The four outcomes, in coins. `actual` marks the outcome that was played, with a label as well as colour. */
function PayoffTable({ actual }: { actual?: { you: Move; maya: Move } }) {
  return (
    <View style={styles.table} accessibilityRole="summary" accessibilityLabel="The rules">
      <View style={styles.tableHead}>
        <AppText variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
          If…
        </AppText>
        <AppText variant="overline" color={colors.primaryText} style={styles.num}>
          You
        </AppText>
        <AppText variant="overline" color={colors.rivalText} style={styles.num}>
          Maya
        </AppText>
      </View>
      {outcomeRows().map((r) => {
        const isActual = actual?.you === r.you && actual.maya === r.maya;
        return (
          <View
            key={r.label}
            accessible
            accessibilityLabel={`${r.label}: you get ${r.result.you}, Maya gets ${r.result.maya}.${isActual ? ' This is what happened.' : ''}`}
            style={[styles.tableRow, isActual && styles.tableRowActual]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="small" color={colors.textBody}>
                {r.label}
              </AppText>
              {isActual ? <Badge label="What happened" tone="amber" style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
            <AppText variant="bodyStrong" tabular align="center" style={styles.num}>
              {r.result.you}
            </AppText>
            <AppText variant="bodyStrong" tabular align="center" style={styles.num}>
              {r.result.maya}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

// ── Stage 3: the reveal ──────────────────────────────────────────────────────

function mayaFace(you: Move, maya: Move): Expression {
  if (maya === 'take') return you === 'share' ? 'confident' : 'concerned';
  return you === 'take' ? 'frustrated' : 'happy';
}

/** Both choices, the coins, and what it means. The deeper explanation and the hypotheticals are optional. */
export function RevealStage({ round, onReplay, onContinue }: { round: Extract<Round, { phase: 'revealed' }>; onReplay: () => void; onContinue: () => void }) {
  const enter = useEnter();
  const reduced = useMotionReduced();
  const { you, maya, result } = round;
  const words = explainOutcome(you, maya);
  const [deeper, setDeeper] = useState(false);
  const dominant = mayaDominantMove();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Maya chose to ${maya}. ${words.happened}`);
  }, [maya, words.happened]);

  return (
    <>
      <View style={styles.faceoff}>
        <Side label="You" move={you} coins={result.you} tone={colors.primaryText}>
          <View style={styles.youAvatar}>
            <UserRound size={30} color={colors.primaryText} />
          </View>
        </Side>
        <AppText variant="overline" color={colors.textFaint}>
          vs
        </AppText>
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(16).delay(150)} style={{ flex: 1 }}>
          <Side label="Maya" move={maya} coins={result.maya} tone={colors.rivalText}>
            <Portrait character="maya" expression={mayaFace(you, maya)} size={64} ring={colors.rival} />
          </Side>
        </Animated.View>
      </View>

      <Animated.View entering={enter(300)} style={{ gap: space.md }}>
        <View style={{ gap: space.xs }} accessibilityLiveRegion="polite">
          <AppText variant="overline" color={colors.textMuted}>
            What happened?
          </AppText>
          <AppText variant="heading" accessibilityRole="header">
            {words.happened}
          </AppText>
        </View>
        <View style={styles.insight}>
          <Lightbulb size={18} color={colors.insight} />
          <View style={{ flex: 1, gap: space.xs }}>
            <AppText variant="overline" color={colors.insight}>
              What does this reveal?
            </AppText>
            <AppText color={colors.textBody}>{words.reveals}</AppText>
          </View>
        </View>
        {dominant ? (
          <AppText variant="small" color={colors.textMuted}>
            <AppText variant="small" weight="semibold" color={colors.textBody}>
              Why did Maya {dominant}?{' '}
            </AppText>
            {mayaSummary()}
          </AppText>
        ) : null}
      </Animated.View>

      <Animated.View entering={enter(380)} style={{ gap: space.md }}>
        <Pressable
          onPress={() => setDeeper(!deeper)}
          accessibilityRole="button"
          accessibilityState={{ expanded: deeper }}
          accessibilityLabel="Go deeper: the incentives, what if, and meeting again"
          style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: colors.surfaceHigh }]}>
          <AppText variant="bodyStrong" color={colors.primaryText} style={{ flex: 1 }}>
            Go deeper
          </AppText>
          <View style={{ transform: [{ rotate: deeper ? '180deg' : '0deg' }] }}>
            <ChevronDown size={20} color={colors.primaryText} />
          </View>
        </Pressable>
        {deeper ? <Deeper you={you} maya={maya} /> : null}
      </Animated.View>

      <Animated.View entering={enter(440)} style={{ gap: space.sm }}>
        <AppText variant="small" color={colors.insight} align="center" style={{ marginBottom: space.xs }}>
          That’s one of the ideas behind strategic thinking.
        </AppText>
        <Button label="Continue" icon={ArrowRight} onPress={onContinue} />
        <Button label="Play it again" variant="ghost" icon={RotateCcw} iconPosition="left" onPress={onReplay} accessibilityHint="Same rules, same Maya" />
      </Animated.View>
    </>
  );
}

function Side({ label, move, coins, tone, children }: { label: string; move: Move; coins: number; tone: string; children: ReactNode }) {
  const Icon = MOVE_ICON[move];
  return (
    <View style={styles.side} accessible accessibilityLabel={`${label}: ${PAST[move].toLowerCase()}, ${coins} coin${coins === 1 ? '' : 's'}`}>
      {children}
      <AppText variant="caption" color={tone}>
        {label}
      </AppText>
      <View style={[styles.moveChip, { borderColor: move === 'share' ? colors.primary : colors.rival }]}>
        <Icon size={14} color={colors.text} />
        <AppText variant="caption" color={colors.text}>
          {PAST[move]}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
        <AnimatedNumber value={coins} variant="title" tabular duration={700} />
        <AppText variant="small" color={colors.textMuted}>
          coin{coins === 1 ? '' : 's'}
        </AppText>
      </View>
    </View>
  );
}

function Deeper({ you, maya }: { you: Move; maya: Move }) {
  const coop = ARENA.cooperation;
  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: space.sm }}>
        <AppText variant="bodyStrong">Maya’s incentives</AppText>
        {mayaReasoning().map((line) => (
          <AppText key={line} variant="small" color={colors.textBody}>
            • {line}
          </AppText>
        ))}
        <AppText variant="small" color={colors.textMuted}>
          The same is true for you. That’s the trap: each player’s best move leaves both worse off than sharing would. It’s called the Prisoner’s Dilemma.
        </AppText>
      </Card>

      <PayoffTable actual={{ you, maya }} />

      {alternatives(you, maya).map((a) => (
        <View key={a.title} style={styles.whatIf} accessible accessibilityLabel={`Hypothetical. ${a.title} ${a.text}`}>
          <Badge label="Hypothetical" tone="cyan" style={{ alignSelf: 'flex-start' }} />
          <AppText variant="bodyStrong">{a.title}</AppText>
          <AppText variant="small" color={colors.textBody}>
            {a.text}
          </AppText>
        </View>
      ))}

      <Card style={{ gap: space.sm }}>
        <AppText variant="bodyStrong">What changes if you meet again?</AppText>
        <AppText variant="small" color={colors.textBody}>
          You met once, so nothing rewarded trust. When the same players meet again and again, today’s choice shapes tomorrow’s, and reputation can make sharing pay. {coop.title} lets you test that.
        </AppText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  opponent: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sealed: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.rivalSoft },
  table: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tableRowActual: { backgroundColor: colors.insightSoft, borderLeftWidth: 3, borderLeftColor: colors.insight },
  num: { width: 52, textAlign: 'center' },
  choices: { flexDirection: 'row', gap: space.md },
  faceoff: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  side: { flex: 1, alignItems: 'center', gap: space.xs, paddingVertical: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  youAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1.5 },
  insight: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.insightSoft, borderWidth: 1, borderColor: 'rgba(253, 186, 116, 0.28)' },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong },
  whatIf: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(34, 211, 238, 0.4)' },
});
