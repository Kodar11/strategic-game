import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Coins, Drama, Hash, type LucideIcon, Play, Plus, X } from '@/src/components/ui/icons';
import { DailyFrame } from '@/src/features/daily-mix/ui';
import { useParty } from '@/src/features/party/store';
import { MAX_NAME, PARTY_GAMES, type PartyGame, canStart, cleanNames } from '@/src/party/party';
import { MAX_FONT_SCALE, colors, radius, space } from '@/src/theme/tokens';

const ICON: Record<PartyGame, LucideIcon> = { traitors: Drama, 'two-thirds': Hash, pot: Coins };
const ORDER: PartyGame[] = ['traitors', 'two-thirds', 'pot'];

/** Party mode: type the names of everyone at the table, pick a game, pass the phone around. */
export default function PartySetupScreen() {
  const saved = useParty((s) => s.players);
  const [names, setNames] = useState<string[]>(() => (saved.length ? saved : ['', '', '', '']));
  const [game, setGame] = useState<PartyGame>('traitors');
  const players = cleanNames(names);
  const [lo, hi] = PARTY_GAMES[game].players;
  const ready = canStart(game, players);

  const edit = (i: number, v: string) => setNames((ns) => ns.map((n, k) => (k === i ? v : n)));
  const remove = (i: number) => setNames((ns) => ns.filter((_, k) => k !== i));
  const start = () => {
    useParty.getState().setPlayers(players);
    router.push({ pathname: '/party/play', params: { game } });
  };

  return (
    <DailyFrame title="Party mode" overline="One phone · pass it around">
      <AppText variant="small" color={colors.textBody}>
        Play with friends in the same room. Everyone takes the phone in turn to make their secret choice; the phone shows only what the whole table should see.
      </AppText>

      <View style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.textMuted} accessibilityRole="header">
          Choose a game
        </AppText>
        {ORDER.map((g) => {
          const Icon = ICON[g];
          const info = PARTY_GAMES[g];
          const on = g === game;
          return (
            <Pressable key={g} onPress={() => setGame(g)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${info.title}. ${info.line} ${info.players[0]} to ${info.players[1]} players, ${info.minutes}.`} style={({ pressed }) => [styles.game, on && styles.gameOn, pressed && { opacity: 0.85 }]}>
              <View style={[styles.icon, on && { backgroundColor: colors.primarySoft }]}>
                <Icon size={20} color={on ? colors.primaryText : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{info.title}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {info.line}
                </AppText>
                <AppText variant="caption" color={colors.textFaint}>
                  {info.players[0]}–{info.players[1]} players · {info.minutes}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.textMuted} accessibilityRole="header">
          Who’s playing?
        </AppText>
        {names.map((n, i) => (
          <View key={i} style={styles.nameRow}>
            <TextInput
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              value={n}
              onChangeText={(v) => edit(i, v)}
              placeholder={`Player ${i + 1}`}
              placeholderTextColor={colors.textFaint}
              maxLength={MAX_NAME}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="next"
              accessibilityLabel={`Player ${i + 1} name`}
              style={styles.input}
            />
            {names.length > 2 ? <IconButton icon={X} label={`Remove player ${i + 1}`} onPress={() => remove(i)} /> : null}
          </View>
        ))}
        {names.length < 10 ? <Button label="Add a player" variant="ghost" compact icon={Plus} iconPosition="left" onPress={() => setNames((ns) => [...ns, ''])} style={{ alignSelf: 'flex-start' }} /> : null}
      </View>

      <Button label={ready ? `Start ${PARTY_GAMES[game].title}` : `${PARTY_GAMES[game].title} needs ${lo}–${hi} players`} icon={Play} disabled={!ready} onPress={start} />
    </DailyFrame>
  );
}

const styles = StyleSheet.create({
  game: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  gameOn: { borderColor: colors.primary, backgroundColor: colors.surfaceHigh },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgRaised, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised, color: colors.text, fontSize: 16 },
});
