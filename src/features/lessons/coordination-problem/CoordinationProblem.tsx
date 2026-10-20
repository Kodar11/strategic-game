import { Coffee, MessageCircle, Trees } from '@/src/components/ui/icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Portrait } from '@/src/components/characters/Portrait';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, Panel, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { TransferQuestion, type TransferOption } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import type { LessonMeta } from '@/src/content/lessons';
import { type FriendInfo, MEETUP_GAME, type Place, friendPolicy, meetupAnalysis, resolveMeetup } from '@/src/game/coordination';
import { payoffAt } from '@/src/game/payoff-matrix';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

const place = z.enum(['cafe', 'park']);
const schema = z.object({
  pick1: place.nullable(),
  committed1: z.boolean(),
  inspected: z.object({ row: place, col: place }).nullable(),
  showBR: z.boolean(),
  pick2: place.nullable(),
  committed2: z.boolean(),
  message: place.nullable(),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  pick1: null,
  committed1: false,
  inspected: null,
  showBR: false,
  pick2: null,
  committed2: false,
  message: null,
  transferPick: null,
  transferChecked: false,
};

const NAME: Record<Place, string> = { cafe: 'Clocktower Café', park: 'Riverside Park' };
const ROW_LABELS = { cafe: 'You: café', park: 'You: park' } as const;
const COL_LABELS = { cafe: 'Nina: café', park: 'Nina: park' } as const;
const FOCAL: FriendInfo = { kind: 'focal', place: 'cafe' };

const TRANSFER: TransferOption[] = [
  {
    id: 'clock',
    label: 'Under the big clock in the main hall',
    strong: true,
    feedback:
      'It is central, visible from every entrance, and widely known as the place people meet. You can expect your friend to expect you there — that shared expectation is what makes it a focal point.',
  },
  {
    id: 'platform',
    label: 'Platform 3, where your train leaves',
    strong: false,
    feedback: 'Sensible if you both know the platform — but if your friend doesn’t, nothing makes it stand out to them.',
  },
  {
    id: 'kiosk',
    label: 'The quiet coffee kiosk by the side exit',
    strong: false,
    feedback: 'It may be the nicest spot, but "best for me" isn’t the same as "obvious to both of us."',
  },
];

export default function CoordinationProblem({ lesson }: { lesson: LessonMeta }) {
  const TOTAL = 11;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL);
  const enter = useEnter();
  const analysis = meetupAnalysis();

  const friend1 = friendPolicy({ kind: 'none' });
  const friend2 = friendPolicy(FOCAL);
  const r1 = data.committed1 && data.pick1 ? resolveMeetup(data.pick1, friend1) : null;
  const r2 = data.committed2 && data.pick2 ? resolveMeetup(data.pick2, friend2) : null;

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Head into town',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="meetup" height={180} />
          </Animated.View>
          <StepHeading kicker="Lesson 3" title="Two dead phones" body="You and Nina agreed to meet in the old town at six. Then both your phones died. You never said where." />
          <Dialogue character="aarav" expression="concerned">
            There are only two places we&apos;d ever go: the Clocktower Café or Riverside Park.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'stakes',
      render: () => (
        <>
          <StepHeading title="What each of you wants" body="Meeting anywhere is good. Missing each other ruins the evening." />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <PrefCard who="aarav" title="You" cafe={payoffAt(MEETUP_GAME, 'cafe', 'cafe')[0]} park={payoffAt(MEETUP_GAME, 'park', 'park')[0]} />
            <PrefCard who="nina" title="Nina" cafe={payoffAt(MEETUP_GAME, 'cafe', 'cafe')[1]} park={payoffAt(MEETUP_GAME, 'park', 'park')[1]} />
          </View>
          <Panel tone="info" title="Missing each other: 0 for both">
            The numbers are how much each of you enjoys the evening. You slightly prefer the café; Nina prefers the park. But any meeting beats none.
          </Panel>
        </>
      ),
    },
    {
      key: 'pick1',
      cta: data.committed1 ? 'See what happened' : 'Go there',
      canContinue: !!data.pick1,
      blockedHint: 'Choose where to go.',
      onContinue: () => {
        if (!data.committed1) update({ committed1: true });
      },
      render: () => (
        <>
          <StepHeading kicker="Your move" title="Where do you go?" body="Nina is deciding at the same moment, with the same information you have." />
          <PlacePicker value={data.pick1} onChange={(p) => update({ pick1: p })} locked={data.committed1} />
        </>
      ),
    },
    {
      key: 'reveal1',
      render: () =>
        r1 ? (
          <>
            <MeetReveal you={r1.you} friend={r1.friend} met={r1.met} payoffs={r1.payoffs} />
            <Panel tone="info" title="Nina's reasoning (now revealed)" delay={300}>
              With nothing else to go on, Nina went where she would most like to meet: {NAME[friend1]}.
            </Panel>
          </>
        ) : null,
    },
    {
      key: 'matrix',
      canContinue: data.showBR,
      blockedHint: 'Reveal the best replies to continue.',
      render: () => (
        <>
          <StepHeading kicker="The table" title="Two ways to get it right" body="Tap any cell. Your enjoyment first, Nina's second." />
          <Card>
            <PayoffMatrix
              game={MEETUP_GAME}
              rowName="You"
              colName="Nina"
              rowLabels={ROW_LABELS}
              colLabels={COL_LABELS}
              outcome={r1 ? { row: r1.you, col: r1.friend } : undefined}
              selected={data.inspected ?? undefined}
              onCellPress={(row, col) => update({ inspected: { row, col } })}
              showBestReplies={data.showBR}
            />
          </Card>
          {data.inspected ? (
            <AppText variant="small" color={colors.textMuted}>
              {data.inspected.row === data.inspected.col
                ? `Both at ${NAME[data.inspected.row]}: if either of you walked off alone, you'd drop to 0. Neither wants to switch.`
                : `You at ${NAME[data.inspected.row]}, Nina at ${NAME[data.inspected.col]}: both would rather be wherever the other one is.`}
            </AppText>
          ) : null}
          {!data.showBR ? (
            <Button label="Show best replies" variant="secondary" onPress={() => update({ showBR: true })} />
          ) : (
            <Panel tone="insight" title={`${analysis.equilibria.length} equilibria, no dominant strategy`}>
              Your best move is simply &ldquo;go where Nina goes&rdquo; — and the same for her. Each meeting outcome is a Nash equilibrium: once you&apos;re there, nobody gains by leaving alone. The hard part is knowing which one you&apos;re aiming for.
            </Panel>
          )}
        </>
      ),
    },
    {
      key: 'pick2',
      cta: data.committed2 ? 'See what happened' : 'Go there',
      canContinue: !!data.pick2,
      blockedHint: 'Choose where to go.',
      onContinue: () => {
        if (!data.committed2) update({ committed2: true });
      },
      render: () => (
        <>
          <StepHeading kicker="A week later" title="Same problem, one clue" body="Phones dead again. But you remember something you both know." />
          <Dialogue character="nina" expression="happy" align="right">
            (Last month) &ldquo;Let&apos;s make the clocktower our usual spot — easy to remember.&rdquo;
          </Dialogue>
          <Dialogue character="aarav" expression="thinking" delay={120}>
            She&apos;ll remember that. And she knows I remember it too.
          </Dialogue>
          <PlacePicker value={data.pick2} onChange={(p) => update({ pick2: p })} locked={data.committed2} />
        </>
      ),
    },
    {
      key: 'reveal2',
      render: () =>
        r2 ? (
          <>
            <MeetReveal you={r2.you} friend={r2.friend} met={r2.met} payoffs={r2.payoffs} />
            <Panel tone="info" title="Nina's reasoning" delay={300}>
              With a reference point you both share, Nina went to it: {NAME[friend2]} — even though she enjoys the park a little more.
            </Panel>
          </>
        ) : null,
    },
    {
      key: 'focal',
      render: () => (
        <>
          <StepHeading kicker="The idea" title="Focal points" />
          <Dialogue character="sen" expression="explaining">
            When several outcomes would work, people coordinate on the one that stands out to everyone — and that everyone knows stands out. That&apos;s a focal point.
          </Dialogue>
          <Panel tone="insight" title="Shared, not best" delay={120}>
            The café wasn&apos;t the best place for Nina. It became the answer because it was the expectation you both held. Without that clue, there was no guaranteed right answer.
          </Panel>
          <Card style={{ gap: space.xs }}>
            <SectionLabel>Where focal points come from</SectionLabel>
            <AppText variant="small">Shared history (&ldquo;our usual spot&rdquo;), convention (driving on one side of the road), prominence (the biggest landmark), or simple labels (&ldquo;meet at the entrance&rdquo;).</AppText>
          </Card>
        </>
      ),
    },
    {
      key: 'message',
      canContinue: !!data.message,
      blockedHint: 'Choose which message to send.',
      render: () => {
        const msg = data.message ? resolveMeetup(data.message, friendPolicy({ kind: 'message', proposed: data.message })) : null;
        return (
          <>
            <StepHeading kicker="Experiment" title="One text gets through" body="Suppose your phone survives just long enough to send one message. Nina will see it." />
            <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
              {(['cafe', 'park'] as const).map((p) => (
                <ChoiceCard key={p} compact icon={MessageCircle} title={`"Meet at the ${p === 'cafe' ? 'café' : 'park'}"`} selected={data.message === p} onSelect={() => update({ message: p })} />
              ))}
            </View>
            {msg ? (
              <>
                <Panel tone="success" title={`You meet at ${NAME[msg.you]}`}>
                  {`Nina's stated rule: follow the message. Going elsewhere would leave her with 0, while meeting gives her ${msg.payoffs[1]}. You get ${msg.payoffs[0]}.`}
                </Panel>
                <Panel tone="caution" title="Communication helps here — it isn't magic">
                  It works because missing each other is bad for both. If messages could be lost, if Nina doubted you&apos;d stick to it, or if one of you strongly preferred missing over the &ldquo;wrong&rdquo; place, a message might not settle it.
                </Panel>
              </>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading kicker="New situation" title="The busy train station" body="You're meeting a friend at a huge station you've both visited. No signal, no plan beyond 'the station, 5 pm'." />
          <TransferQuestion
            question="Where do you wait?"
            options={TRANSFER}
            picked={data.transferPick}
            checked={data.transferChecked}
            onPick={(id) => update({ transferPick: id })}
            onCheck={() => update({ transferChecked: true })}
          />
        </>
      ),
    },
    {
      key: 'done',
      render: () => (
        <Completion
          lesson={lesson}
          takeaway="When many outcomes could work, success depends on shared expectations — not on finding the single best option."
          remember={[
            'Ask what the other person expects you to expect.',
            'Look for what stands out to both of you: history, convention, prominence.',
            'A clear signal in advance is often worth more than a clever guess later.',
          ]}
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} />;
}

function PrefCard({ who, title, cafe, park }: { who: 'aarav' | 'nina'; title: string; cafe: number; park: number }) {
  return (
    <Card style={{ flex: 1, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Portrait character={who} expression="happy" size={36} />
        <AppText variant="bodyStrong">{title}</AppText>
      </View>
      <PrefRow icon="cafe" value={cafe} />
      <PrefRow icon="park" value={park} />
    </Card>
  );
}

function PrefRow({ icon, value }: { icon: Place; value: number }) {
  const Icon = icon === 'cafe' ? Coffee : Trees;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          {icon === 'cafe' ? 'Meet at café' : 'Meet at park'}
        </AppText>
        <AppText variant="caption" color={colors.text} tabular>
          {value}
        </AppText>
      </View>
      <View style={styles.prefTrack}>
        <View style={[styles.prefFill, { width: `${(value / 10) * 100}%` }]} />
      </View>
    </View>
  );
}

function PlacePicker({ value, onChange, locked }: { value: Place | null; onChange: (p: Place) => void; locked: boolean }) {
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
        <ChoiceCard title={NAME.cafe} description="Under the old clocktower, in the main square." icon={Coffee} selected={value === 'cafe'} disabled={locked} onSelect={() => onChange('cafe')} />
        <ChoiceCard title={NAME.park} description="Benches by the water, a short walk away." icon={Trees} tone="orange" selected={value === 'park'} disabled={locked} onSelect={() => onChange('park')} />
      </View>
      {locked ? (
        <AppText variant="caption" color={colors.textMuted}>
          Decision made. Replay the lesson to try the other place.
        </AppText>
      ) : null}
    </>
  );
}

function MeetReveal({ you, friend, met, payoffs }: { you: Place; friend: Place; met: boolean; payoffs: readonly [number, number] }) {
  const reduced = useMotionReduced();
  const enter = useEnter();
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setShown(true), 650);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <>
      <StepHeading kicker="Six o'clock" title={!shown ? 'You arrive and look around…' : met ? `You find each other at ${NAME[you]}` : 'No sign of Nina'} />
      <View style={styles.revealRow}>
        {(['cafe', 'park'] as const).map((p) => (
          <View key={p} style={[styles.place, p === you && { borderColor: colors.primary }]}>
            <AppText variant="caption" color={colors.textMuted}>
              {NAME[p]}
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.xs, minHeight: 48, alignItems: 'center' }}>
              {p === you ? <Portrait character="aarav" expression={!shown ? 'curious' : met ? 'happy' : 'frustrated'} size={44} ring={colors.primary} /> : null}
              {shown && p === friend ? (
                <Animated.View entering={enter(0)}>
                  <Portrait character="nina" expression={met ? 'happy' : 'concerned'} size={44} ring={colors.rival} />
                </Animated.View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      {shown ? (
        <Panel tone={met ? 'success' : 'caution'} title={met ? `You get ${payoffs[0]}, Nina gets ${payoffs[1]}` : 'You each get 0'} delay={150}>
          {met
            ? 'You coordinated. Neither of you would now want to be anywhere else.'
            : `You waited at ${NAME[you]}. Nina waited at ${NAME[friend]}. Both choices were reasonable — they just didn't match.`}
        </Panel>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  prefTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  prefFill: { height: '100%', backgroundColor: colors.insight, borderRadius: 3 },
  revealRow: { flexDirection: 'row', gap: space.sm },
  place: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
});
