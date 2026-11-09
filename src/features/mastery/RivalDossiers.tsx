import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChevronDown, Lock, Star } from '@/src/components/ui/icons';
import { DOSSIER_PAGE } from '@/src/mastery/dossiers';
import { type MasterySystem, type RivalStars, STAR_KINDS, STAR_LABEL, type StarKind, gameKey, gameStars, starCount } from '@/src/mastery/rules';
import { colors, radius, space } from '@/src/theme/tokens';
import { dossierFor, rivalsOf } from './dossier';
import { useMastery } from './store';

/** Three stars in a row, filled for the ones held. */
export function StarRow({ stars, size = 14 }: { stars: RivalStars | undefined; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${starCount(stars)} of 3 stars`}>
      {STAR_KINDS.map((k) => (
        <Star key={k} size={size} color={stars?.[k] ? colors.insight : colors.textMuted} fill={stars?.[k] ? colors.insight : 'transparent'} strokeWidth={2} />
      ))}
    </View>
  );
}

/**
 * On a game's setup screen: every rival's mastery stars and dossier. Each star unlocks one page; a locked page says
 * which star opens it. Folded by default, so the setup screen stays short.
 */
export function RivalDossiers({ system, game }: { system: MasterySystem; game: string }) {
  const stars = useMastery((s) => s.stars[gameKey(system, game)]);
  const map = useMastery((s) => s.stars);
  const [open, setOpen] = useState(false);
  const [rival, setRival] = useState<string | null>(null);
  useEffect(() => {
    void useMastery.getState().load();
  }, []);
  const rivals = rivalsOf(system, game);
  if (!rivals.length) return null;
  const total = gameStars(map, system, game, rivals.map((r) => r.id));

  return (
    <Card style={{ gap: space.sm }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.head}>
        <SectionLabel>Rival dossiers</SectionLabel>
        <View style={{ flex: 1 }} />
        <AppText variant="caption" color={colors.textMuted} tabular>
          {`${total.held}/${total.total}`}
        </AppText>
        <Star size={14} color={colors.insight} fill={total.held ? colors.insight : 'transparent'} />
        <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <>
          <AppText variant="small" color={colors.textBody}>
            Each star opens a page of that rival’s dossier: beat it, beat it on Hard, and name it in a mystery match.
          </AppText>
          {rivals.map((r) => {
            const held = stars?.[r.id];
            const expanded = rival === r.id;
            const dossier = dossierFor(system, game, r.id);
            return (
              <View key={r.id} style={styles.rival}>
                <Pressable onPress={() => setRival(expanded ? null : r.id)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${r.name}, ${starCount(held)} of 3 stars`} style={styles.rivalHead}>
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    {r.name}
                  </AppText>
                  <StarRow stars={held} />
                  <ChevronDown size={16} color={colors.textMuted} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                </Pressable>
                {expanded && dossier
                  ? STAR_KINDS.map((k) => <Page key={k} kind={k} unlocked={!!held?.[k]} text={dossier[DOSSIER_PAGE[k].key]} />)
                  : null}
              </View>
            );
          })}
        </>
      ) : null}
    </Card>
  );
}

function Page({ kind, unlocked, text }: { kind: StarKind; unlocked: boolean; text: string }) {
  return (
    <View style={styles.page}>
      <AppText variant="overline" color={unlocked ? colors.insight : colors.textMuted}>
        {DOSSIER_PAGE[kind].title}
      </AppText>
      {unlocked ? (
        <AppText variant="small" color={colors.textBody}>
          {text}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Lock size={12} color={colors.textMuted} />
          <AppText variant="caption" color={colors.textMuted}>
            {`${STAR_LABEL[kind]} to unlock`}
          </AppText>
        </View>
      )}
    </View>
  );
}

/**
 * On a result screen: the stars this match earned against this rival, if any. `since` is when the match screen
 * opened, so stars from an earlier match never show again.
 */
export function NewStars({ system, game, opponent, since }: { system: MasterySystem; game: string; opponent: string; since: number }) {
  const fresh = useMastery((s) => s.fresh);
  const mine = fresh.filter((f) => f.key === gameKey(system, game) && f.opponent === opponent && f.at >= since);
  if (!mine.length) return null;
  const name = rivalsOf(system, game).find((r) => r.id === opponent)?.name ?? opponent;
  return (
    <View style={styles.fresh} accessibilityLiveRegion="polite">
      <Star size={18} color={colors.insight} fill={colors.insight} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{mine.length === 1 ? 'New mastery star' : `${mine.length} new mastery stars`}</AppText>
        <AppText variant="small" color={colors.textBody}>
          {`${mine.map((f) => STAR_LABEL[f.kind]).join(' · ')} — ${name}. A new page of its dossier is open on the game’s screen.`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
  rival: { gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  rivalHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  page: { gap: 2, paddingLeft: space.sm, borderLeftWidth: 2, borderLeftColor: colors.border },
  fresh: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.insightSoft },
});
