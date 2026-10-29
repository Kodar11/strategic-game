import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, ChevronDown, CircleHelp, Lock, Play } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { Segmented } from '@/src/components/ui/Segmented';
import { ARENA, LENGTH_LABEL, LEVEL_HINT, LEVEL_LABEL, opponentName } from '@/src/arena/catalog';
import { ARENA_IDS, LENGTHS, LEVELS, type Level, type MatchLength, isArenaId } from '@/src/arena/core';
import { COOP_PAYOFFS, type CoopMove, coopPayoff } from '@/src/arena/cooperation';
import { MYSTERY, READ_RULES } from '@/src/arena/reads';
import { TEAM_GAMES } from '@/src/features/arena/ui/library';
import { MiniMatrix } from '@/src/features/games/ui/common';
import { played, useArenaRecords } from '@/src/features/arena/records';
import { ARENA_TINT, ArenaArt, PERSONA_ICON } from '@/src/features/arena/ui/parts';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const;

// Static web export renders a page per arena game.
export function generateStaticParams() {
  return ARENA_IDS.map((gameId) => ({ gameId }));
}

/**
 * A Strategy Arena game's entry: the premise in a few seconds (title, one-line challenge, the strategic question,
 * the decisions you'll make), How to Play, then opponent, difficulty, length and mode — all with defaults, so Play is
 * one tap away. Challenge modes unlock after one finished match.
 */
export default function ArenaGameScreen() {
  const insets = useSafeAreaInsets();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const loaded = useArenaRecords((s) => s.loaded);
  const record = useArenaRecords((s) => (isArenaId(gameId) ? s.games[gameId] : undefined));
  const prefs = useArenaRecords((s) => (isArenaId(gameId) ? s.prefs[gameId] : undefined));
  const coached = useArenaRecords((s) => (isArenaId(gameId) ? s.coached[gameId] : undefined));
  const reads = useArenaRecords((s) => (isArenaId(gameId) ? s.reads[gameId] : undefined));
  const [chosen, setPersona] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('easy');
  const [length, setLength] = useState<MatchLength>('standard');
  const [variant, setVariant] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState<boolean | null>(null);

  useEffect(() => {
    void useArenaRecords.getState().load();
  }, []);

  // Once records load, start from the last setup used for this game.
  const [applied, setApplied] = useState(false);
  if (loaded && !applied) {
    setApplied(true);
    if (prefs) {
      setPersona(prefs.persona);
      setLevel(prefs.level);
      setLength(prefs.length);
      setVariant(prefs.variant);
    }
  }

  if (!isArenaId(gameId)) return <MessageScreen title="Game not found" body="This game isn’t available in this version of the app." />;
  const g = ARENA[gameId];
  const tint = ARENA_TINT[gameId];
  const unlocked = played(record) > 0;
  const standard = g.variants.find((v) => !v.challenge)!.id;
  // A mystery opponent by default; a named one when the player picks it (and this game offers it).
  const persona = chosen && chosen !== MYSTERY && g.opponents.some((o) => o.id === chosen) ? chosen : MYSTERY;
  const team = TEAM_GAMES.has(gameId);
  const who = team ? 'teammate' : gameId === 'auction' || gameId === 'market' ? 'main rival' : 'opponent';
  const mode = variant && g.variants.some((v) => v.id === variant && (!v.challenge || unlocked)) ? variant : standard;
  const showRules = rulesOpen ?? (loaded && !coached && !unlocked);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  const play = () => {
    useArenaRecords.getState().savePrefs(gameId, { persona, level, length, variant: mode });
    router.push({ pathname: '/arena/play', params: { game: gameId, persona, level, length, variant: mode } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
          </View>

          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
            <ArenaArt game={gameId} size={84} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="overline" color={tint.fg}>
                Strategy Arena
              </AppText>
              <AppText variant="title" accessibilityRole="header">
                {g.title}
              </AppText>
            </View>
          </View>
          {g.subtitle ? (
            <AppText variant="bodyStrong" color={tint.fg}>
              {g.subtitle}
            </AppText>
          ) : null}
          <AppText color={colors.textBody}>{g.intro ?? g.tagline}</AppText>

          <View style={[styles.question, { borderColor: tint.fg }]}>
            <AppText variant="overline" color={tint.fg}>
              The question
            </AppText>
            <AppText variant="heading">{g.question}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
              {g.decisions.map((d) => (
                <View key={d} style={[styles.chip, { backgroundColor: tint.bg }]}>
                  <AppText variant="caption" color={tint.fg}>
                    {d}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {gameId === 'cooperation' ? <CoopPreview /> : null}

          <Card style={{ gap: space.sm }}>
            <Pressable onPress={() => setRulesOpen(!showRules)} accessibilityRole="button" accessibilityState={{ expanded: showRules }} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
              <SectionLabel>How to play</SectionLabel>
              <View style={{ flex: 1 }} />
              <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: showRules ? '180deg' : '0deg' }] }} />
            </Pressable>
            {showRules
              ? g.rules.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                    <AppText variant="small" color={colors.textMuted} tabular>
                      {i + 1}.
                    </AppText>
                    <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                      {r}
                    </AppText>
                  </View>
                ))
              : null}
          </Card>

          <View style={{ gap: space.sm }}>
            <SectionLabel>{`Your ${who}`}</SectionLabel>
            <ChoiceCard
              compact
              icon={CircleHelp}
              title={`Mystery ${who}`}
              description={`One of the four personalities, kept hidden. Watch ${READ_RULES[gameId].evidence}, then guess ${READ_RULES[gameId].target}’s personality.`}
              selected={persona === MYSTERY}
              onSelect={() => setPersona(MYSTERY)}
              tone="orange"
            />
            <AppText variant="caption" color={colors.textMuted}>
              Or practise against a known personality:
            </AppText>
            {g.opponents.map((o) => {
              const t = record?.byPersona[o.id];
              return (
                <ChoiceCard
                  key={o.id}
                  compact
                  icon={PERSONA_ICON[o.id]}
                  title={o.name}
                  description={[o.summary, o.tendency, t ? `You ${t.w}–${t.l}${t.d ? `–${t.d}` : ''}` : null].filter(Boolean).join('  ·  ')}
                  selected={persona === o.id}
                  onSelect={() => setPersona(o.id)}
                  tone="orange"
                />
              );
            })}
            {gameId === 'auction' || gameId === 'market' ? (
              <AppText variant="caption" color={colors.textMuted}>
                {gameId === 'auction' ? 'Two other personalities join the room as bidders.' : 'One other personality runs the third firm.'}
              </AppText>
            ) : null}
          </View>

          <View style={{ gap: space.xs }}>
            <Segmented label="Difficulty" options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} value={level} onChange={setLevel} tone="orange" />
            <AppText variant="caption" color={colors.textMuted}>
              {LEVEL_HINT[level]}. Same rules and payoffs on every level.
            </AppText>
          </View>

          <Segmented label="Match length" options={LENGTHS.map((l) => ({ value: l, label: `${LENGTH_LABEL[l]} · ${g.rounds(l)}` }))} value={length} onChange={setLength} tone="orange" />

          <View style={{ gap: space.xs }}>
            <AppText variant="caption" color={colors.textMuted}>
              Mode
            </AppText>
            {g.variants.map((v) => {
              const locked = v.challenge && !unlocked;
              const on = mode === v.id;
              return (
                <Pressable
                  key={v.id}
                  disabled={locked}
                  onPress={() => setVariant(v.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: locked }}
                  accessibilityLabel={`${v.name}${v.challenge ? ', challenge' : ''}. ${locked ? 'Finish one match to unlock.' : v.summary}`}
                  style={[styles.mode, on && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }, locked && { opacity: 0.55 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="small" weight="semibold">
                      {v.name}
                      {v.challenge ? <AppText variant="caption" color={colors.insight}>{'  CHALLENGE'}</AppText> : null}
                    </AppText>
                    <AppText variant="caption" color={colors.textMuted}>
                      {locked ? 'Finish one match to unlock' : v.summary}
                    </AppText>
                  </View>
                  {locked ? <Lock size={16} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Button label={persona === MYSTERY ? `Play · mystery ${who}` : `Play ${team ? 'with' : 'vs'} ${opponentName(gameId, persona)}`} icon={Play} onPress={play} />

          {record && played(record) ? (
            <Card style={{ gap: space.xs }}>
              <SectionLabel>Your record</SectionLabel>
              <AppText variant="bodyStrong" tabular>
                {record.w} won · {record.l} lost · {record.d} drawn{record.best !== null ? `  ·  best ${record.best} ${g.unit}` : ''}
              </AppText>
              {reads && reads.right + reads.wrong ? (
                <AppText variant="small" color={colors.insight}>
                  Personality reads: {reads.right} right of {reads.right + reads.wrong}
                </AppText>
              ) : null}
              {record.recent.slice(0, 5).map((m, i) => (
                <View key={i} style={styles.hist}>
                  <AppText variant="small" weight="semibold" color={m.outcome === 'win' ? colors.success : m.outcome === 'loss' ? colors.rivalText : colors.textBody} style={{ width: 44 }}>
                    {OUTCOME[m.outcome]}
                  </AppText>
                  <AppText variant="small" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                    {opponentName(gameId, m.persona)} · {LEVEL_LABEL[m.level]}
                  </AppText>
                  <AppText variant="small" tabular color={colors.textMuted}>
                    {m.player}–{m.rival}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const COOP_LABEL: Record<CoopMove, string> = { C: 'Cooperate', D: 'Defect' };

/** The Cooperation Game's intro extras: the payoff matrix at a glance and why repetition matters. */
function CoopPreview() {
  const g = ARENA.cooperation;
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="overline" color={colors.textMuted}>
        Points per round · you / them
      </AppText>
      <MiniMatrix moves={['C', 'D'] as const} labels={COOP_LABEL} payoff={(p, b) => coopPayoff(COOP_PAYOFFS.classic, p, b)} />
      {g.whyRepeated ? (
        <AppText variant="small" color={colors.textBody}>
          {g.whyRepeated}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  question: { gap: space.xs, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.bgRaised },
  chip: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill },
  mode: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hist: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
});
