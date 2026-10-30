import Animated from 'react-native-reanimated';
import { View } from 'react-native';
import { z } from 'zod';

import { LessonArt } from '@/src/components/art/LessonArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, Panel, StepHeading } from '@/src/components/lesson/Panels';
import { TransferQuestion } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { AppText } from '@/src/components/ui/AppText';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import type { LessonMeta } from '@/src/content/lessons';
import { useCurriculumClips } from '@/src/features/audio/useNarration';
import { scenariosFor } from '@/src/features/scenarios';
import { useProgress } from '@/src/store/progress';
import { colors, space } from '@/src/theme/tokens';
import { labFor } from './labs';
import { LabView } from './LabView';
import { scenarioRecap, scenarioStep } from './scenarioSteps';
import { curriculumSpec } from './specs';

const schema = z.object({ labDone: z.boolean(), transferPick: z.string().nullable(), transferChecked: z.boolean() });
type Data = z.infer<typeof schema>;
const INITIAL: Data = { labDone: false, transferPick: null, transferChecked: false };
const TOTAL = 7;

/**
 * The shared runner for the curriculum's new lessons:
 * intro → scenario A (experience the mechanism) → lab (name the concept) → scenario B (change an assumption) →
 * scenario C (transfer) → transfer check → completion. Every gated step needs its interaction finished first.
 */
export default function CurriculumLesson({ lesson }: { lesson: LessonMeta }) {
  const spec = curriculumSpec(lesson.id)!;
  const lab = labFor(lesson.id)!;
  const [a, b, c] = scenariosFor(lesson.id);
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL);
  const done = useProgress((s) => s.scenarioDone);
  const learning = useProgress((s) => s.learning);
  const enter = useEnter();
  const clip = useCurriculumClips(lesson.id, spec);

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Start',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <LessonArt lesson={lesson.id} height={170} />
          </Animated.View>
          <StepHeading kicker={spec.intro.kicker ?? `Lesson ${lesson.number}`} title={spec.intro.title} body={spec.intro.body} clip={clip('intro.heading')} />
          {spec.intro.lines.map((l, i) => (
            <Dialogue key={l.text} character={l.character} expression={l.expression} align={l.align} delay={80 + i * 80} clip={clip(`intro.line-${i + 1}`)}>
              {l.text}
            </Dialogue>
          ))}
          <Panel tone="info" title="The strategic question" delay={260}>
            {spec.question}
          </Panel>
          <Card style={{ gap: space.xs }}>
            <SectionLabel>In this lesson you will</SectionLabel>
            {spec.objectives.map((o) => (
              <AppText key={o} variant="small">
                • {o}
              </AppText>
            ))}
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.xs }}>
              Three games: learn the mechanism, change an assumption, then use it somewhere new.
            </AppText>
          </Card>
        </>
      ),
    },
    scenarioStep(a, done),
    {
      key: 'lab',
      canContinue: data.labDone,
      blockedHint: 'Try the lab to continue.',
      render: () => (
        <>
          <StepHeading kicker="The idea" title={spec.concept.title} />
          <Dialogue character={spec.concept.line.character} expression={spec.concept.line.expression ?? 'explaining'} clip={clip('concept.line')}>
            {spec.concept.line.text}
          </Dialogue>
          <LabView lab={lab} onExplored={() => update({ labDone: true })} />
          {spec.concept.panels.map((p) => (
            <Panel key={p.title} tone={p.tone} title={p.title}>
              {p.body}
            </Panel>
          ))}
        </>
      ),
    },
    scenarioStep(b, done),
    scenarioStep(c, done),
    {
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading kicker="Somewhere new" title="Check your reasoning" body="A different situation. No hints about which idea applies." />
          <TransferQuestion
            question={spec.transfer.question}
            options={spec.transfer.options.map((o) => ({ ...o, clip: clip(`transfer.${o.id}`) }))}
            picked={data.transferPick}
            checked={data.transferChecked}
            onPick={(id) => !data.transferChecked && update({ transferPick: id })}
            onCheck={() => update({ transferChecked: true })}
            analogy={spec.transfer.analogy}
          />
        </>
      ),
    },
    {
      key: 'done',
      render: () => (
        <View>
          <Completion
            lesson={lesson}
            takeaway={spec.completion.takeaway}
            takeawayClip={clip('done.takeaway')}
            remember={spec.completion.remember}
            onReplay={restart}
            recap={[
              ...scenarioRecap(lesson.id, learning),
              ...(data.transferPick ? [`Transfer check: ${spec.transfer.options.find((o) => o.id === data.transferPick)?.verdict === 'strong' ? 'strongest reasoning' : 'worth comparing with the strongest answer'}.`] : []),
            ]}
            reflection={spec.completion.reflection}
            nextHook={spec.completion.nextHook}
          />
        </View>
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} onRestart={restart} />;
}
