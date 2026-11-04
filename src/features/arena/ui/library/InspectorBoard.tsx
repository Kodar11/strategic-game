import { View } from 'react-native';

import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { FadeInOnce, Stamp } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { CircleCheck, ClipboardCheck, Eye, Handshake, ScanSearch, Scissors, ShieldCheck, Zap } from '@/src/components/ui/icons';
import { INSPECT_COST, type InspectAction, type InspectorState, PAYOFFS, inspectPayoff, playerOperates } from '@/src/arena/inspector';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row, signed } from '../parts';
import { Overline } from './kit';

/** Your role, the stakes in that role, two decisions and a stamp on the reveal. The screen changes with the role. */
export function InspectorBoard({ state, act, over, rivalName }: BoardProps<InspectorState, InspectAction>) {
  const n = state.rounds.length;
  const last = state.rounds[n - 1];
  const operating = playerOperates(n);
  const v = state.setup.variant;
  const P = PAYOFFS[v];
  const stamp = last ? (last.ins === 'inspect' ? (last.op === 'cut' ? { text: 'VIOLATION FOUND', color: colors.danger } : { text: 'INSPECTED · CLEAN', color: colors.success }) : last.op === 'cut' ? { text: 'UNCHECKED · CORNERS CUT', color: colors.rivalText } : { text: 'TRUSTED · COMPLIANT', color: colors.textMuted }) : null;
  const roleTint = operating ? colors.primary : colors.rival;
  const RoleIcon = operating ? ClipboardCheck : ScanSearch;
  return (
    <View style={{ gap: space.md }}>
      {last && stamp ? (
        <Reveal revealKey={n} tone={last.points[0] >= 0 ? 'plain' : 'bad'} overline={`Round ${n} · you were the ${last.operator === 'player' ? 'operator' : 'inspector'}`}>
          <Stamp revealKey={n} text={stamp.text} color={stamp.color} />
          <AppText variant="small" color={colors.textBody}>
            {last.operator === 'player' ? `You ${last.op === 'cut' ? 'cut corners' : 'complied'}; they ${last.ins === 'inspect' ? 'inspected' : 'trusted you'}.` : `They ${last.op === 'cut' ? 'cut corners' : 'complied'}; you ${last.ins === 'inspect' ? 'inspected' : 'trusted them'}.`} You {signed(last.points[0])}, them {signed(last.points[1])}.
          </AppText>
        </Reveal>
      ) : null}

      {!over ? (
        <FadeInOnce revealKey={`${n}-${operating}`}>
          <View style={{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: roleTint, backgroundColor: colors.surface, overflow: 'hidden' }}>
            <Row style={{ padding: space.sm, paddingHorizontal: space.md, backgroundColor: operating ? colors.primarySoft : colors.rivalSoft }}>
              <RoleIcon size={20} color={operating ? colors.primaryText : colors.rivalText} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={operating ? colors.primaryText : colors.rivalText} accessibilityLiveRegion="polite">
                  {operating ? 'You file the report' : 'You check the report'}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  Round {n + 1} of {state.total} · you are the {operating ? 'operator' : 'inspector'}
                </AppText>
              </View>
            </Row>
            <View style={{ padding: space.md, gap: space.sm }}>
              <AppText variant="caption" color={colors.textBody}>
                {operating ? `${rivalName} decides whether to inspect at the same time. It can’t see your report.` : `${rivalName} files its report at the same time. Inspecting costs you ${INSPECT_COST}.`}
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {operating ? (
                  <>
                    <ChoiceTile label="Comply" hint={`${signed(P.comply)} either way`} icon={<ShieldCheck size={22} color={colors.primaryText} />} tint={colors.primaryText} bg={colors.primarySoft} onPress={() => act('comply')} />
                    <ChoiceTile label="Cut corners" hint={`${signed(P.cheatUnseen)} unchecked · ${signed(P.fine)} if inspected`} icon={<Zap size={22} color={colors.rivalText} />} tint={colors.rivalText} bg={colors.rivalSoft} onPress={() => act('cut')} />
                  </>
                ) : (
                  <>
                    <ChoiceTile label="Inspect" hint={`${signed(inspectPayoff(v, 'comply', 'inspect')[1])} if clean · ${signed(inspectPayoff(v, 'cut', 'inspect')[1])} if caught`} icon={<Eye size={22} color={colors.rivalText} />} tint={colors.rivalText} bg={colors.rivalSoft} onPress={() => act('inspect')} />
                    <ChoiceTile label="Trust" hint={`0 if compliant · ${signed(P.damage)} if not`} icon={<ShieldCheck size={22} color={colors.primaryText} />} tint={colors.primaryText} bg={colors.primarySoft} onPress={() => act('trust')} />
                  </>
                )}
              </View>
            </View>
          </View>
        </FadeInOnce>
      ) : null}

      {state.rounds.length ? (
        <View style={{ gap: 4 }} accessible accessibilityLabel={`History: ${state.rounds.map((r, i) => `round ${i + 1}, ${r.operator === 'player' ? 'you operated' : 'you inspected'}: ${r.op === 'cut' ? 'cut corners' : 'complied'}, ${r.ins === 'inspect' ? 'inspected' : 'trusted'}`).join('; ')}`}>
          <Overline>Audit log</Overline>
          <Row style={{ flexWrap: 'wrap', gap: 4 }}>
            {state.rounds.map((r, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 3, width: 34, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: r.operator === 'player' ? colors.primarySoft : colors.rivalSoft }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {i + 1}
                </AppText>
                {r.op === 'cut' ? <Scissors size={14} color={colors.danger} /> : <CircleCheck size={14} color={colors.success} />}
                {r.ins === 'inspect' ? <Eye size={14} color={colors.text} /> : <Handshake size={14} color={colors.textMuted} />}
              </View>
            ))}
          </Row>
          <AppText variant="caption" color={colors.textFaint}>
            Blue: you operated · orange: you inspected · top: report · bottom: check
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
