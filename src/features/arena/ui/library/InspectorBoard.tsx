import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { ClipboardCheck, Eye, ScanSearch, ShieldCheck, Zap } from '@/src/components/ui/icons';
import { INSPECT_COST, type InspectAction, type InspectorState, PAYOFFS, inspectPayoff, playerOperates } from '@/src/arena/inspector';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { ActionTile, type BoardProps, Reveal, Row, signed } from '../parts';
import { Overline, Panel } from './kit';

/** A compact inspection dashboard: your role, the stakes in this role, two decisions, and a stamp on the reveal. */
export function InspectorBoard({ state, act, over, rivalName }: BoardProps<InspectorState, InspectAction>) {
  const reduced = useMotionReduced();
  const n = state.rounds.length;
  const last = state.rounds[n - 1];
  const operating = playerOperates(n);
  const v = state.setup.variant;
  const P = PAYOFFS[v];
  const go = (a: InspectAction) => {
    haptic.commit();
    act(a);
  };
  const stamp = last ? (last.ins === 'inspect' ? (last.op === 'cut' ? { text: 'VIOLATION FOUND', color: colors.danger } : { text: 'INSPECTED · CLEAN', color: colors.success }) : last.op === 'cut' ? { text: 'UNCHECKED · CORNERS CUT', color: colors.rivalText } : { text: 'TRUSTED · COMPLIANT', color: colors.textMuted }) : null;
  return (
    <View style={{ gap: space.lg }}>
      {last && stamp ? (
        <Reveal revealKey={n} tone={last.points[0] >= 0 ? 'plain' : 'bad'} overline={`Round ${n} · you were the ${last.operator === 'player' ? 'operator' : 'inspector'}`}>
          <Animated.View entering={reduced ? undefined : ZoomIn.duration(220)} style={{ alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 2, borderColor: stamp.color, transform: [{ rotate: '-3deg' }] }}>
            <AppText variant="bodyStrong" color={stamp.color} accessibilityLiveRegion="polite">
              {stamp.text}
            </AppText>
          </Animated.View>
          <AppText variant="small" color={colors.textBody}>
            {last.operator === 'player' ? `You ${last.op === 'cut' ? 'cut corners' : 'complied'}; ${rivalName} ${last.ins === 'inspect' ? 'inspected' : 'trusted you'}.` : `${rivalName} ${last.op === 'cut' ? 'cut corners' : 'complied'}; you ${last.ins === 'inspect' ? 'inspected' : 'trusted it'}.`}{' '}
            You {signed(last.points[0])}, them {signed(last.points[1])}.
          </AppText>
        </Reveal>
      ) : null}

      {!over ? (
        <Panel accent={operating ? 'rgba(37,99,235,0.45)' : 'rgba(249,115,22,0.4)'}>
          <Row>
            {operating ? <ClipboardCheck size={18} color={colors.primaryText} /> : <ScanSearch size={18} color={colors.rivalText} />}
            <Overline color={operating ? colors.primaryText : colors.rivalText}>
              Round {n + 1} of {state.total} · you are the {operating ? 'operator' : 'inspector'}
            </Overline>
          </Row>
          <AppText variant="small" color={colors.textBody}>
            {operating
              ? `${rivalName} decides whether to inspect at the same time. It can’t see your report.`
              : `${rivalName} files its report at the same time. Inspecting costs you ${INSPECT_COST}.`}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {operating ? (
              <>
                <ActionTile label="Comply" hint={`${signed(P.comply)} either way`} icon={ShieldCheck} tint={colors.primaryText} bg={colors.primarySoft} onPress={() => go('comply')} />
                <ActionTile label="Cut corners" hint={`${signed(P.cheatUnseen)} unchecked · ${signed(P.fine)} if inspected`} icon={Zap} tint={colors.rivalText} bg={colors.rivalSoft} onPress={() => go('cut')} />
              </>
            ) : (
              <>
                <ActionTile label="Inspect" hint={`${signed(inspectPayoff(v, 'comply', 'inspect')[1])} if clean · ${signed(inspectPayoff(v, 'cut', 'inspect')[1])} if caught`} icon={Eye} tint={colors.rivalText} bg={colors.rivalSoft} onPress={() => go('inspect')} />
                <ActionTile label="Trust" hint={`0 if compliant · ${signed(P.damage)} if not`} icon={ShieldCheck} tint={colors.primaryText} bg={colors.primarySoft} onPress={() => go('trust')} />
              </>
            )}
          </View>
        </Panel>
      ) : null}

      {state.rounds.length ? (
        <View style={{ gap: 4 }} accessible accessibilityLabel={`History: ${state.rounds.map((r, i) => `round ${i + 1}, ${r.operator === 'player' ? 'you operated' : 'you inspected'}: ${r.op}, ${r.ins}`).join('; ')}`}>
          <Overline>Audit log</Overline>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {state.rounds.map((r, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 2, width: 40, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: r.operator === 'player' ? colors.primarySoft : colors.rivalSoft }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {i + 1}
                </AppText>
                <AppText variant="caption">{r.op === 'cut' ? '✂️' : '✅'}</AppText>
                <AppText variant="caption">{r.ins === 'inspect' ? '🔍' : '🤝'}</AppText>
              </View>
            ))}
          </Row>
          <AppText variant="caption" color={colors.textFaint}>
            Blue: you operated · orange: you inspected · ✂️ cut corners · 🔍 inspected
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
