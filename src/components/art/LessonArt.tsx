import { type ReactNode, useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { type LessonId, getLesson } from '@/src/content/lessons';
import { palette } from '@/src/theme/tokens';
import { SceneArt } from './SceneArt';

/**
 * Lesson thumbnails: one concept-specific vector illustration per lesson, all in one visual system
 * (see docs/ASSETS.md · "Lesson thumbnails"):
 * - Canvas 360×150. Everything important sits in the safe area x 40–320, y 22–128, so the art survives both the
 *   lesson-card crop (≈3.3:1) and the lesson-intro crop (≈2:1) with `slice`.
 * - Lesson cards overlay the number (top-left) and a "Completed" pill (top-right), so keep focal subjects out of
 *   x < 50 and x > 245 for y < 58.
 * - Deep-navy stage, cool blue key light from the upper left, warm orange rim from the lower right, a faint
 *   perspective floor. Blue = you, orange = the other side, amber = the insight/focal point, cyan = information.
 * - No text, numbers or UI in the art; one focal point per image.
 * Lessons without art fall back to their environment plate (`SceneArt`).
 */
export function LessonArt({ lesson, height = 104, style }: { lesson: LessonId; height?: number; style?: StyleProp<ViewStyle> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `${n}${uid}`;
  const Art = ART[lesson];
  if (!Art) return <SceneArt scene={getLesson(lesson)?.scene ?? 'market'} height={height} style={style} />;
  return (
    <View style={[{ height, overflow: 'hidden' }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0C2140" />
            <Stop offset="1" stopColor={palette.deepNavy} />
          </LinearGradient>
          <RadialGradient id={id('key')} cx="18%" cy="8%" r="75%">
            <Stop offset="0" stopColor={palette.blue} stopOpacity={0.34} />
            <Stop offset="1" stopColor={palette.blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={id('rim')} cx="88%" cy="96%" r="60%">
            <Stop offset="0" stopColor={palette.orange} stopOpacity={0.26} />
            <Stop offset="1" stopColor={palette.orange} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={id('focus')} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.amber} stopOpacity={0.55} />
            <Stop offset="1" stopColor={palette.amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="360" height="150" fill={`url(#${id('sky')})`} />
        <Rect width="360" height="150" fill={`url(#${id('key')})`} />
        <Rect width="360" height="150" fill={`url(#${id('rim')})`} />
        <Floor />
        <Art glow={`url(#${id('focus')})`} />
      </Svg>
    </View>
  );
}

type ArtProps = { glow: string };

const C = {
  blue: palette.blue,
  orange: palette.orange,
  amber: palette.amber,
  cyan: palette.cyan,
  light: palette.light,
  slate: palette.slate,
  far: '#10243D',
  mid: '#16365A',
  near: '#0A1A2E',
  ink: '#0B1626',
  head: '#1F2A3A',
};

/** Faint perspective floor shared by every thumbnail. */
function Floor() {
  return (
    <G>
      <Path d="M0 118 L360 118 L360 150 L0 150 Z" fill={C.near} opacity={0.85} />
      <Line x1="0" y1="118" x2="360" y2="118" stroke={C.slate} strokeWidth={0.6} opacity={0.25} />
      <G stroke={C.slate} strokeWidth={0.5} opacity={0.1}>
        {[-200, -110, -30, 50, 130, 210, 290, 370, 460].map((x) => (
          <Line key={x} x1={180 + (x - 180) * 0.35} y1="118" x2={x} y2="150" />
        ))}
      </G>
    </G>
  );
}

/** A person: you (blue), the other side (orange), or a bystander (slate). `s` scales from the feet. */
function Person({ x, y, color, s = 1, arm }: { x: number; y: number; color: string; s?: number; arm?: 'up' | 'out' }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Ellipse cx="0" cy="0.5" rx="9" ry="2" fill="#000" opacity={0.35} />
      <Path d="M-7 0 L-6 -17 Q0 -21 6 -17 L7 0 Z" fill={color} />
      <Circle cx="0" cy="-25" r="5.5" fill={C.head} stroke={color} strokeWidth={1} />
      {arm === 'up' ? <Path d="M5 -16 L11 -28" stroke={color} strokeWidth={3} strokeLinecap="round" /> : null}
      {arm === 'out' ? <Path d="M5 -15 L14 -12" stroke={color} strokeWidth={3} strokeLinecap="round" /> : null}
    </G>
  );
}

function Halo({ x, y, r, glow }: { x: number; y: number; r: number; glow: string }) {
  return <Circle cx={x} cy={y} r={r} fill={glow} />;
}

// ── Module 1 ─────────────────────────────────────────────────────────────

/** 1 · Prisoner's Dilemma: two sealed rooms, one choice each — and a bridge between them that neither can build alone. */
function CooperationTrap({ glow }: ArtProps) {
  const room = (x: number, color: string, flip?: boolean) => (
    <G>
      <Path d={`M${x} 46 L${x + 92} 46 L${x + 92} 118 L${x} 118 Z`} fill={C.mid} />
      <Path d={`M${x} 46 L${x + 92} 46 L${x + 84} 54 L${x + 8} 54 Z`} fill={C.far} />
      <Rect x={x + 8} y={54} width={76} height={64} fill={color} opacity={0.08} />
      <Path d={`M${flip ? x + 18 : x + 74} 54 L${flip ? x + 6 : x + 86} 118`} stroke={color} strokeWidth={1} opacity={0.4} />
      <Circle cx={x + 46} cy={60} r={3} fill={color} />
      <Path d={`M${x + 46} 62 L${x + 30} 118 L${x + 62} 118 Z`} fill={color} opacity={0.12} />
    </G>
  );
  return (
    <G>
      {room(64, C.blue)}
      {room(204, C.orange, true)}
      {/* The wall between them */}
      <Rect x={160} y={42} width={40} height={76} fill={C.ink} />
      <Rect x={160} y={42} width={40} height={4} fill={C.slate} opacity={0.3} />
      {/* The cooperative bridge: dashed, unfinished */}
      <Halo x={180} y={32} r={22} glow={glow} />
      <Path d="M118 42 Q180 12 242 42" stroke={C.amber} strokeWidth={2} strokeDasharray="5 5" fill="none" />
      <Circle cx={180} cy={27} r={3.5} fill={C.amber} />
      <Person x={110} y={112} color={C.blue} s={1.1} />
      <Person x={250} y={112} color={C.orange} s={1.1} />
      {/* Each one's switch */}
      <Rect x={130} y={88} width={10} height={16} rx={2} fill={C.ink} stroke={C.blue} strokeWidth={1} />
      <Rect x={220} y={88} width={10} height={16} rx={2} fill={C.ink} stroke={C.orange} strokeWidth={1} />
    </G>
  );
}

/** 2 · Dominance: a payoff board where whole rows are struck out until one move is left, under a magnifier. */
function IteratedDominance({ glow }: ArtProps) {
  const x0 = 104;
  const y0 = 30;
  const w = 38;
  const h = 26;
  return (
    <G>
      <Path d={`M${x0 - 8} ${y0 - 8} L${x0 + 3 * w + 8} ${y0 - 8} L${x0 + 3 * w + 8} ${y0 + 3 * h + 8} L${x0 - 8} ${y0 + 3 * h + 8} Z`} fill={C.mid} opacity={0.7} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <Rect key={`${r}${c}`} x={x0 + c * w + 2} y={y0 + r * h + 2} width={w - 4} height={h - 4} rx={3} fill={r === 1 && c === 1 ? C.amber : C.far} opacity={r === 1 ? 1 : 0.55} />
        )),
      )}
      {/* Eliminated rows */}
      <Line x1={x0 - 4} y1={y0 + h / 2} x2={x0 + 3 * w + 4} y2={y0 + h / 2} stroke={C.orange} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={x0 - 4} y1={y0 + 2.5 * h} x2={x0 + 3 * w + 4} y2={y0 + 2.5 * h} stroke={C.orange} strokeWidth={2.5} strokeLinecap="round" />
      <Halo x={x0 + 1.5 * w} y={y0 + 1.5 * h} r={30} glow={glow} />
      {/* Magnifier */}
      <G transform="translate(262 80)">
        <Circle cx="0" cy="0" r="17" fill={C.cyan} fillOpacity={0.14} stroke={C.light} strokeWidth={3} />
        <Line x1="12" y1="12" x2="26" y2="28" stroke={C.light} strokeWidth={5} strokeLinecap="round" />
      </G>
      <Person x={64} y={116} color={C.blue} s={1.1} arm="out" />
    </G>
  );
}

/** 3 · Nash equilibrium: best-reply arrows in a 2×2 grid all flow into one stable cell. */
function BestResponse({ glow }: ArtProps) {
  const cx = [150, 210];
  const cy = [48, 92];
  return (
    <G>
      <Rect x={118} y={24} width={124} height={92} rx={8} fill={C.mid} opacity={0.6} />
      {cx.map((x) => cy.map((y) => <Rect key={`${x}${y}`} x={x - 26} y={y - 18} width={52} height={36} rx={5} fill={x === 210 && y === 92 ? C.amber : C.far} opacity={x === 210 && y === 92 ? 0.9 : 0.8} />))}
      <Halo x={210} y={92} r={36} glow={glow} />
      {/* Blue arrows (your best replies) and orange arrows (theirs) */}
      <Path d="M150 66 L150 76" stroke={C.blue} strokeWidth={3} strokeLinecap="round" />
      <Path d="M145 72 L150 78 L155 72" stroke={C.blue} strokeWidth={2.5} fill="none" />
      <Path d="M210 66 L210 72" stroke={C.blue} strokeWidth={3} strokeLinecap="round" />
      <Path d="M205 69 L210 75 L215 69" stroke={C.blue} strokeWidth={2.5} fill="none" />
      <Path d="M176 48 L184 48" stroke={C.orange} strokeWidth={3} strokeLinecap="round" />
      <Path d="M181 43 L187 48 L181 53" stroke={C.orange} strokeWidth={2.5} fill="none" />
      <Path d="M174 92 L182 92" stroke={C.orange} strokeWidth={3} strokeLinecap="round" />
      <Path d="M179 87 L185 92 L179 97" stroke={C.orange} strokeWidth={2.5} fill="none" />
      <Person x={84} y={116} color={C.blue} s={1.1} />
      <Person x={280} y={116} color={C.orange} s={1.1} />
    </G>
  );
}

// ── Module 2 ─────────────────────────────────────────────────────────────

/** 4 · Coordination: two people, two equally good meeting places, and no way to talk. */
function CoordinationProblem({ glow }: ArtProps) {
  return (
    <G>
      {/* Two lit destinations */}
      <Halo x={130} y={58} r={30} glow={glow} />
      <Halo x={230} y={58} r={30} glow={glow} />
      <G>
        <Rect x={116} y={44} width={28} height={36} rx={3} fill={C.mid} />
        <Path d="M112 44 L148 44 L144 36 L116 36 Z" fill={C.amber} />
        <Rect x={124} y={56} width={12} height={10} fill={C.amber} opacity={0.5} />
      </G>
      <G>
        <Rect x={228} y={58} width={4} height={22} fill={C.ink} />
        <Circle cx={230} cy={50} r={16} fill="#134040" />
        <Circle cx={230} cy={50} r={16} fill={C.amber} opacity={0.12} />
      </G>
      {/* Paths from each person toward both places */}
      <Path d="M70 112 Q100 96 128 84" stroke={C.blue} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
      <Path d="M70 112 Q160 106 226 84" stroke={C.blue} strokeWidth={1.5} strokeDasharray="4 4" fill="none" opacity={0.5} />
      <Path d="M290 112 Q260 96 232 84" stroke={C.orange} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
      <Path d="M290 112 Q200 106 134 84" stroke={C.orange} strokeWidth={1.5} strokeDasharray="4 4" fill="none" opacity={0.5} />
      <Person x={66} y={116} color={C.blue} s={1.1} />
      <Person x={294} y={116} color={C.orange} s={1.1} />
    </G>
  );
}

/** 5 · Mixed strategies: a striker's two possible shots, decided by a spinning half-blue, half-orange coin. */
function PredictabilityTrap({ glow }: ArtProps) {
  return (
    <G>
      <G stroke={C.light} opacity={0.85}>
        <Path d="M104 112 L104 50 L256 50 L256 112" strokeWidth={4} fill="none" />
        {Array.from({ length: 8 }, (_, i) => (
          <Line key={i} x1={122 + i * 17} y1="52" x2={122 + i * 17} y2="112" strokeWidth={0.6} opacity={0.3} />
        ))}
      </G>
      <Person x={180} y={112} color={C.orange} s={1.4} />
      <Path d="M168 90 L150 80 M192 90 L210 80" stroke={C.orange} strokeWidth={4} strokeLinecap="round" />
      <Path d="M180 120 Q150 104 124 68" stroke={C.blue} strokeWidth={2} strokeDasharray="4 4" fill="none" />
      <Path d="M180 120 Q210 104 236 68" stroke={C.blue} strokeWidth={2} strokeDasharray="4 4" fill="none" />
      {/* The coin */}
      <Halo x={180} y={34} r={18} glow={glow} />
      <Ellipse cx={180} cy={34} rx={6} ry={9} fill={C.blue} />
      <Path d="M180 25 A6 9 0 0 1 180 43 Z" fill={C.orange} />
      <Circle cx={180} cy={122} r={5} fill="#F8FAFC" />
    </G>
  );
}

/** 6 · Cournot & Bertrand: two factories facing off across a staircase of falling prices. */
function MarketCompetition({ glow }: ArtProps) {
  const factory = (x: number, color: string, flip?: boolean) => (
    <G transform={flip ? `translate(${2 * x + 60} 0) scale(-1 1)` : undefined}>
      <Path d={`M${x} 118 L${x} 70 L${x + 15} 80 L${x + 15} 70 L${x + 30} 80 L${x + 30} 70 L${x + 45} 80 L${x + 60} 80 L${x + 60} 118 Z`} fill={C.mid} />
      <Rect x={x + 44} y={46} width={9} height={34} fill={C.far} />
      <Circle cx={x + 50} cy={40} r={5} fill={C.slate} opacity={0.2} />
      <Circle cx={x + 56} cy={32} r={6} fill={C.slate} opacity={0.14} />
      <Rect x={x + 8} y={92} width={14} height={10} fill={color} opacity={0.6} />
      <Rect x={x + 30} y={92} width={14} height={10} fill={color} opacity={0.6} />
    </G>
  );
  return (
    <G>
      {factory(52, C.blue)}
      {factory(248, C.orange, true)}
      {/* Falling price steps */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Rect key={i} x={132 + i * 20} y={46 + i * 13} width={16} height={72 - i * 13} rx={2} fill={i % 2 ? C.orange : C.blue} opacity={0.35 + i * 0.1} />
      ))}
      <Halo x={222} y={104} r={20} glow={glow} />
      <Path d="M136 36 L226 92" stroke={C.amber} strokeWidth={2} strokeDasharray="3 4" />
      <Path d="M220 84 L228 94 L216 94" stroke={C.amber} strokeWidth={2} fill="none" />
    </G>
  );
}

/** 7 · Evolutionary stability: a population dish that settles into a stable mix of hawks and doves. */
function Evolution({ glow }: ArtProps) {
  const dots: [number, number, 'b' | 'o'][] = [
    [-30, -8, 'o'], [-18, 10, 'b'], [-6, -16, 'o'], [8, 4, 'o'], [22, -10, 'b'], [30, 12, 'o'], [-34, 14, 'o'], [-10, 22, 'b'],
    [14, 22, 'o'], [36, -4, 'o'], [0, -2, 'b'], [-22, -22, 'o'], [20, -24, 'o'], [-2, 32, 'o'], [-40, 0, 'b'],
  ];
  return (
    <G>
      <Halo x={180} y={74} r={64} glow={glow} />
      <Ellipse cx={180} cy={110} rx={78} ry={14} fill="#000" opacity={0.3} />
      <Ellipse cx={180} cy={74} rx={70} ry={44} fill={C.cyan} opacity={0.06} stroke={C.cyan} strokeWidth={1.5} strokeOpacity={0.6} />
      <Ellipse cx={180} cy={74} rx={58} ry={34} fill="none" stroke={C.cyan} strokeWidth={0.6} strokeOpacity={0.3} />
      {dots.map(([dx, dy, k], i) => (
        <Circle key={i} cx={180 + dx * 1.2} cy={74 + dy} r={4.5} fill={k === 'o' ? C.orange : C.blue} />
      ))}
      {/* Balancing arrows */}
      <Path d="M84 60 Q76 74 84 88" stroke={C.amber} strokeWidth={2} fill="none" />
      <Path d="M80 84 L84 90 L89 85" stroke={C.amber} strokeWidth={2} fill="none" />
      <Path d="M276 88 Q284 74 276 60" stroke={C.amber} strokeWidth={2} fill="none" />
      <Path d="M280 64 L276 58 L271 63" stroke={C.amber} strokeWidth={2} fill="none" />
    </G>
  );
}

// ── Module 3 ─────────────────────────────────────────────────────────────

/** 8 · Backward induction: a game tree read from its last branches back to the first move. */
function SequentialMoves({ glow }: ArtProps) {
  const node = (x: number, y: number, color: string, r = 6) => <Circle cx={x} cy={y} r={r} fill={C.ink} stroke={color} strokeWidth={2.5} />;
  return (
    <G>
      <G stroke={C.slate} strokeWidth={1.5} opacity={0.55}>
        <Line x1="80" y1="74" x2="160" y2="44" />
        <Line x1="80" y1="74" x2="160" y2="104" />
        <Line x1="160" y1="44" x2="240" y2="30" />
        <Line x1="160" y1="44" x2="240" y2="58" />
        <Line x1="160" y1="104" x2="240" y2="90" />
        <Line x1="160" y1="104" x2="240" y2="118" />
      </G>
      {/* The solution path, traced backwards in amber */}
      <Path d="M240 58 L160 44 L80 74" stroke={C.amber} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Halo x={240} y={58} r={20} glow={glow} />
      {node(80, 74, C.blue, 8)}
      {node(160, 44, C.orange)}
      {node(160, 104, C.orange)}
      {[30, 58, 90, 118].map((y) => (
        <Rect key={y} x={234} y={y - 5} width={12} height={10} rx={2} fill={y === 58 ? C.amber : C.far} stroke={C.slate} strokeWidth={0.8} />
      ))}
    </G>
  );
}

/** 9 · Credibility: the incumbent's "wall" is only an outline — the entrant walks straight through it. */
function Credibility({ glow }: ArtProps) {
  return (
    <G>
      {/* Incumbent's fortress */}
      <Path d="M220 118 L220 52 L232 52 L232 44 L244 44 L244 52 L256 52 L256 44 L268 44 L268 52 L290 52 L290 118 Z" fill={C.mid} />
      <Rect x={244} y={84} width={20} height={34} rx={10} fill={C.orange} opacity={0.3} />
      <Person x={284} y={116} color={C.orange} s={1.1} arm="up" />
      {/* The empty threat */}
      <Rect x={150} y={44} width={22} height={74} fill="none" stroke={C.orange} strokeWidth={2} strokeDasharray="5 5" opacity={0.85} />
      <Halo x={161} y={92} r={26} glow={glow} />
      <Person x={150} y={116} color={C.blue} s={1.2} />
      <Path d="M70 112 L128 112" stroke={C.blue} strokeWidth={1.5} strokeDasharray="4 4" />
      <Path d="M124 107 L131 112 L124 117" stroke={C.blue} strokeWidth={1.5} fill="none" />
    </G>
  );
}

/** 10 · Incentive design: a panel of reward and penalty levers, and the effort behind frosted glass it cannot see. */
function IncentiveShift({ glow }: ArtProps) {
  return (
    <G>
      {/* Control desk */}
      <Path d="M56 118 L66 76 L156 76 L166 118 Z" fill={C.mid} />
      <Rect x={74} y={84} width={30} height={6} rx={3} fill={C.far} />
      <Rect x={118} y={84} width={30} height={6} rx={3} fill={C.far} />
      <Line x1="84" y1="87" x2="76" y2="62" stroke={C.light} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={76} cy={60} r={5} fill={C.blue} />
      <Line x1="138" y1="87" x2="146" y2="62" stroke={C.light} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={146} cy={60} r={5} fill={C.orange} />
      {/* Frosted window with a worker's silhouette */}
      <Rect x={200} y={30} width={100} height={88} rx={4} fill={C.far} />
      <Rect x={206} y={36} width={88} height={82} fill={C.cyan} opacity={0.08} />
      <G opacity={0.45}>
        <Person x={250} y={112} color={C.slate} s={1.5} arm="up" />
      </G>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Line key={i} x1={206} y1={44 + i * 14} x2={294} y2={38 + i * 14} stroke={C.light} strokeWidth={0.6} opacity={0.15} />
      ))}
      <Halo x={250} y={70} r={34} glow={glow} />
      <Path d="M170 70 Q186 62 198 70" stroke={C.amber} strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
    </G>
  );
}

// ── Module 4 ─────────────────────────────────────────────────────────────

/** 11 · Bargaining: one pie, two hands, and a cut that depends on who can walk away. */
function Bargaining({ glow }: ArtProps) {
  return (
    <G>
      <Ellipse cx={180} cy={106} rx={64} ry={12} fill="#000" opacity={0.3} />
      <Halo x={180} y={76} r={52} glow={glow} />
      <Ellipse cx={180} cy={90} rx={56} ry={20} fill={C.far} />
      <Ellipse cx={180} cy={80} rx={56} ry={20} fill={C.blue} opacity={0.75} />
      <Path d="M180 80 L224 68 A56 20 0 0 1 222 94 Z" fill={C.orange} opacity={0.9} />
      <Path d="M180 80 L236 80 M180 80 L224 68" stroke={C.light} strokeWidth={1.5} opacity={0.8} />
      {/* Two hands reaching in */}
      <Person x={84} y={116} color={C.blue} s={1.3} arm="out" />
      <Path d="M100 96 L118 88" stroke={C.blue} strokeWidth={3.5} strokeLinecap="round" />
      <G transform="translate(552 0) scale(-1 1)">
        <Person x={276} y={116} color={C.orange} s={1.3} arm="out" />
        <Path d="M292 96 L312 88" stroke={C.orange} strokeWidth={3.5} strokeLinecap="round" />
      </G>
      {/* Clock ring: each round the pie shrinks */}
      <Ellipse cx={180} cy={80} rx={68} ry={26} fill="none" stroke={C.amber} strokeWidth={1.2} strokeDasharray="2 5" opacity={0.7} />
    </G>
  );
}

/** 12 · War of attrition: two candles burning down on either side of a prize — waiting costs both. */
function WarOfAttrition({ glow }: ArtProps) {
  const candle = (x: number, h: number, color: string) => (
    <G>
      <Rect x={x - 9} y={118 - h} width={18} height={h} rx={3} fill={color} opacity={0.75} />
      <Path d={`M${x - 9} ${122 - h} Q${x - 4} ${128 - h} ${x - 6} ${134 - h}`} stroke={color} strokeWidth={3} fill="none" opacity={0.6} />
      <Line x1={x} y1={118 - h} x2={x} y2={112 - h} stroke={C.light} strokeWidth={1.2} />
      <Ellipse cx={x} cy={104 - h} rx={4.5} ry={8} fill={C.amber} />
      <Ellipse cx={x} cy={106 - h} rx={2} ry={4} fill="#FFF7ED" />
    </G>
  );
  return (
    <G>
      {candle(92, 36, C.blue)}
      {candle(268, 30, C.orange)}
      {/* The prize */}
      <Halo x={180} y={66} r={40} glow={glow} />
      <Path d="M164 50 L196 50 L192 74 Q180 84 168 74 Z" fill={C.amber} />
      <Rect x={176} y={82} width={8} height={14} fill={C.amber} opacity={0.8} />
      <Rect x={166} y={96} width={28} height={6} rx={2} fill={C.amber} opacity={0.8} />
      {/* Hourglass */}
      <G transform="translate(180 118)">
        <Path d="M-8 -14 L8 -14 L0 -7 Z M-8 0 L8 0 L0 -7 Z" fill={C.slate} opacity={0.6} />
      </G>
    </G>
  );
}

/** 13 · Repeated games: a path of stepping stones into the distance — both lights on at each round, fading with the future. */
function RepeatedCooperation({ glow }: ArtProps) {
  const stones = [
    [104, 110, 30],
    [168, 92, 22],
    [216, 78, 16],
    [252, 68, 12],
    [278, 61, 9],
    [297, 56, 6],
  ];
  return (
    <G>
      <Halo x={232} y={40} r={28} glow={glow} />
      <Circle cx={232} cy={40} r={7} fill={C.amber} opacity={0.8} />
      {stones.map(([x, y, w], i) => (
        <G key={i} opacity={1 - i * 0.13}>
          <Ellipse cx={x} cy={y} rx={w} ry={w * 0.32} fill={C.mid} />
          <Circle cx={x - w * 0.35} cy={y - w * 0.12} r={Math.max(1.5, w * 0.12)} fill={C.blue} />
          <Circle cx={x + w * 0.35} cy={y - w * 0.12} r={Math.max(1.5, w * 0.12)} fill={C.orange} />
        </G>
      ))}
      <Person x={92} y={106} color={C.blue} s={1.05} />
      <Person x={118} y={106} color={C.orange} s={1.05} />
    </G>
  );
}

// ── Module 5 ─────────────────────────────────────────────────────────────

/** 14 · Reasoning from beliefs: a thought inside a thought inside a thought, over a number line pulled toward zero. */
function StrategyDetective({ glow }: ArtProps) {
  return (
    <G>
      <Person x={78} y={116} color={C.blue} s={1.25} />
      <Circle cx={96} cy={74} r={3} fill={C.light} opacity={0.5} />
      <Circle cx={104} cy={64} r={4.5} fill={C.light} opacity={0.5} />
      <Ellipse cx={158} cy={56} rx={46} ry={28} fill={C.mid} stroke={C.light} strokeOpacity={0.4} />
      <Person x={136} y={72} color={C.orange} s={0.7} />
      <Ellipse cx={174} cy={48} rx={24} ry={16} fill={C.far} stroke={C.light} strokeOpacity={0.3} />
      <Person x={166} y={56} color={C.cyan} s={0.38} />
      <Ellipse cx={184} cy={44} rx={8} ry={6} fill={C.ink} stroke={C.light} strokeOpacity={0.25} />
      {/* The number line */}
      <Line x1="140" y1="104" x2="312" y2="104" stroke={C.slate} strokeWidth={1.2} opacity={0.6} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Line key={i} x1={140 + i * 43} y1="100" x2={140 + i * 43} y2="108" stroke={C.slate} opacity={0.6} />
      ))}
      <Halo x={176} y={104} r={20} glow={glow} />
      <Circle cx={176} cy={104} r={5} fill={C.amber} />
      <Path d="M300 92 Q240 80 186 96" stroke={C.amber} strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
      <Path d="M192 90 L184 97 L194 100" stroke={C.amber} strokeWidth={1.5} fill="none" />
    </G>
  );
}

/** 15 · Bayesian reasoning: a beam of evidence cuts through fog toward a figure who might be one of two types. */
function BayesianUncertainty({ glow }: ArtProps) {
  return (
    <G>
      <Person x={76} y={116} color={C.blue} s={1.2} arm="out" />
      <Path d="M94 96 L300 54 L300 112 Z" fill={C.cyan} opacity={0.1} />
      <Path d="M94 96 L300 54" stroke={C.cyan} strokeWidth={0.8} opacity={0.4} />
      <Path d="M94 96 L300 112" stroke={C.cyan} strokeWidth={0.8} opacity={0.4} />
      <Rect x={88} y={92} width={10} height={6} rx={2} fill={C.light} />
      {/* Fog bands */}
      {[40, 62, 84].map((y, i) => (
        <Path key={y} d={`M150 ${y} Q200 ${y - 8} 250 ${y} T350 ${y}`} stroke={C.slate} strokeWidth={10} opacity={0.08 + i * 0.03} fill="none" strokeLinecap="round" />
      ))}
      <Halo x={250} y={86} r={34} glow={glow} />
      {/* Two possible types, overlapping */}
      <G opacity={0.55}>
        <Person x={244} y={112} color={C.orange} s={1.3} />
      </G>
      <G opacity={0.35}>
        <Person x={258} y={112} color={C.slate} s={1.3} />
      </G>
      {/* Belief meter */}
      <Rect x={150} y={28} width={64} height={7} rx={3.5} fill={C.far} />
      <Rect x={150} y={28} width={26} height={7} rx={3.5} fill={C.orange} />
      <Rect x={176} y={28} width={38} height={7} rx={3.5} fill={C.slate} opacity={0.6} />
    </G>
  );
}

/** 16 · Signalling: climbing a costly staircase to hold up a badge that an observer can trust. */
function Signaling({ glow }: ArtProps) {
  return (
    <G>
      {[0, 1, 2, 3, 4].map((i) => (
        <Rect key={i} x={96 + i * 22} y={118 - (i + 1) * 11} width={22} height={(i + 1) * 11} fill={C.mid} opacity={0.6 + i * 0.08} />
      ))}
      <Halo x={212} y={44} r={30} glow={glow} />
      <Person x={207} y={63} color={C.blue} s={1.05} arm="up" />
      <G transform="translate(227 30)">
        <Circle cx="0" cy="0" r="8" fill={C.amber} />
        <Path d="M-5 6 L-7 16 L0 12 L7 16 L5 6" fill={C.amber} opacity={0.8} />
      </G>
      {/* Observer */}
      <Person x={288} y={116} color={C.orange} s={1.15} />
      <Path d="M280 82 Q258 62 234 46" stroke={C.orange} strokeWidth={1.2} strokeDasharray="3 4" fill="none" opacity={0.8} />
      {/* Someone who didn't climb */}
      <G opacity={0.5}>
        <Person x={70} y={116} color={C.slate} s={1.05} />
      </G>
    </G>
  );
}

/** 17 · Auctions: sealed bids converge on a gavel — and the winning envelope glows a little too brightly. */
function Auctions({ glow }: ArtProps) {
  const env = (x: number, y: number, color: string, r: number) => (
    <G transform={`rotate(${r} ${x} ${y})`}>
      <Rect x={x - 20} y={y - 13} width={40} height={26} rx={3} fill={C.far} stroke={color} strokeWidth={1.5} />
      <Path d={`M${x - 20} ${y - 13} L${x} ${y + 2} L${x + 20} ${y - 13}`} stroke={color} strokeWidth={1.5} fill="none" />
    </G>
  );
  return (
    <G>
      {env(92, 54, C.blue, -8)}
      {env(102, 96, C.cyan, 6)}
      {env(300, 70, C.orange, 8)}
      <Halo x={262} y={96} r={28} glow={glow} />
      {env(262, 96, C.amber, -5)}
      {/* Gavel and block */}
      <Rect x={150} y={104} width={60} height={12} rx={3} fill={C.mid} />
      <G transform="rotate(-28 180 70)">
        <Rect x={160} y={56} width={40} height={18} rx={4} fill={C.amber} opacity={0.9} />
        <Rect x={177} y={74} width={6} height={40} rx={2} fill={C.light} opacity={0.8} />
      </G>
    </G>
  );
}

/** 18 · Adverse selection: a used-car lot where a uniform price hides which cars are lemons. */
function MarketQuality({ glow }: ArtProps) {
  const car = (x: number, color: string, lemon?: boolean) => (
    <G>
      <Path d={`M${x} 110 L${x} 98 Q${x + 2} 92 ${x + 10} 92 L${x + 16} 82 L${x + 40} 82 L${x + 48} 92 Q${x + 58} 92 ${x + 58} 100 L${x + 58} 110 Z`} fill={color} opacity={lemon ? 0.55 : 0.85} />
      <Rect x={x + 18} y={85} width={9} height={7} fill={C.ink} opacity={0.7} />
      <Rect x={x + 30} y={85} width={9} height={7} fill={C.ink} opacity={0.7} />
      <Circle cx={x + 13} cy={111} r={5} fill={C.ink} stroke={C.slate} />
      <Circle cx={x + 45} cy={111} r={5} fill={C.ink} stroke={C.slate} />
      {lemon ? (
        <G>
          <Circle cx={x + 6} cy={78} r={4} fill={C.slate} opacity={0.25} />
          <Circle cx={x} cy={70} r={5} fill={C.slate} opacity={0.18} />
        </G>
      ) : null}
      {/* Same price tag on every car */}
      <Rect x={x + 22} y={66} width={14} height={10} rx={2} fill={C.amber} />
    </G>
  );
  return (
    <G>
      <Line x1="52" y1="40" x2="308" y2="40" stroke={C.slate} strokeWidth={1} opacity={0.5} />
      {[70, 120, 170, 220, 270].map((x, i) => (
        <Circle key={x} cx={x} cy={44} r={3} fill={i % 2 ? C.amber : C.cyan} opacity={0.7} />
      ))}
      {car(52, C.blue)}
      <Halo x={180} y={96} r={34} glow={glow} />
      {car(151, '#A3A34A', true)}
      {car(250, C.orange)}
    </G>
  );
}

// ── Module 6 ─────────────────────────────────────────────────────────────

/** 19 · The core: three parties, two joined, the third pulling on a link that may break any deal. */
function Coalitions({ glow }: ArtProps) {
  const A = [130, 58];
  const B = [234, 58];
  const P = [182, 106];
  return (
    <G>
      <Halo x={182} y={58} r={46} glow={glow} />
      <Line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={C.amber} strokeWidth={4} strokeLinecap="round" />
      <Line x1={A[0]} y1={A[1]} x2={P[0]} y2={P[1]} stroke={C.slate} strokeWidth={2} strokeDasharray="4 5" />
      <Path d={`M${B[0]} ${B[1]} L${(B[0] + P[0]) / 2 + 4} ${(B[1] + P[1]) / 2 - 4}`} stroke={C.slate} strokeWidth={2} />
      <Path d={`M${(B[0] + P[0]) / 2 - 2} ${(B[1] + P[1]) / 2 + 4} L${P[0]} ${P[1]}`} stroke={C.slate} strokeWidth={2} />
      <Circle cx={A[0]} cy={A[1]} r={20} fill={C.blue} opacity={0.85} />
      <Circle cx={B[0]} cy={B[1]} r={16} fill={C.cyan} opacity={0.75} />
      <Circle cx={P[0]} cy={P[1]} r={13} fill={C.orange} opacity={0.85} />
      <Circle cx={A[0]} cy={A[1]} r={26} fill="none" stroke={C.blue} strokeOpacity={0.3} />
    </G>
  );
}

/** 20 · Voting: a ballot box beneath a cycle of three options, each beating the next. */
function Voting({ glow }: ArtProps) {
  const pts: [number, number, string][] = [
    [180, 32, C.blue],
    [216, 70, C.orange],
    [144, 70, C.cyan],
  ];
  const arrow = (d: string, head: string) => (
    <G>
      <Path d={d} stroke={C.amber} strokeWidth={2} fill="none" />
      <Path d={head} stroke={C.amber} strokeWidth={2} fill="none" />
    </G>
  );
  return (
    <G>
      <Halo x={180} y={56} r={44} glow={glow} />
      {arrow('M190 34 Q214 40 216 58', 'M211 54 L216 61 L221 54')}
      {arrow('M206 76 Q180 86 154 76', 'M158 71 L152 77 L159 81')}
      {arrow('M144 60 Q146 40 168 33', 'M162 29 L170 33 L164 38')}
      {pts.map(([x, y, c]) => (
        <Circle key={c} cx={x} cy={y} r={8} fill={c} />
      ))}
      {/* Ballot box */}
      <Path d="M150 118 L150 98 L210 98 L210 118 Z" fill={C.mid} />
      <Path d="M144 98 L216 98 L208 91 L152 91 Z" fill={C.far} />
      <Rect x={170} y={93} width={20} height={3} rx={1.5} fill={C.ink} />
      <Person x={92} y={116} color={C.slate} s={0.95} />
      <Person x={110} y={116} color={C.blue} s={1.05} />
      <Person x={268} y={116} color={C.orange} s={1.05} />
    </G>
  );
}

/** 21 · Brinkmanship: two vehicles head-on on a narrow bridge, a risk gauge glowing between them. */
function Brinkmanship({ glow }: ArtProps) {
  const car = (x: number, color: string, flip?: boolean) => (
    <G transform={flip ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
      <Path d={`M${x - 26} 98 L${x - 26} 88 L${x - 14} 80 L${x + 10} 80 L${x + 22} 88 L${x + 26} 98 Z`} fill={color} />
      <Rect x={x - 10} y={83} width={14} height={6} fill={C.ink} opacity={0.6} />
      <Circle cx={x - 15} cy={99} r={5} fill={C.ink} stroke={C.slate} />
      <Circle cx={x + 15} cy={99} r={5} fill={C.ink} stroke={C.slate} />
      <Path d={`M${x + 26} 90 L${x + 60} 84 L${x + 60} 98 Z`} fill={C.amber} opacity={0.18} />
    </G>
  );
  return (
    <G>
      {/* Narrow bridge over a drop */}
      <Rect x={40} y={104} width={280} height={8} fill={C.mid} />
      <Rect x={0} y={112} width={360} height={38} fill={C.ink} />
      <G stroke={C.slate} strokeWidth={1} opacity={0.4}>
        {[60, 110, 160, 200, 250, 300].map((x) => (
          <Line key={x} x1={x} y1="112" x2={x - 10} y2="150" />
        ))}
      </G>
      {car(110, C.blue)}
      {car(250, C.orange, true)}
      {/* Risk gauge */}
      <Halo x={180} y={44} r={30} glow={glow} />
      <Path d="M154 52 A26 26 0 0 1 206 52" stroke={C.far} strokeWidth={7} fill="none" strokeLinecap="round" />
      <Path d="M154 52 A26 26 0 0 1 196 34" stroke={C.orange} strokeWidth={7} fill="none" strokeLinecap="round" />
      <Line x1="180" y1="52" x2="196" y2="36" stroke={C.light} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={180} cy={52} r={4} fill={C.light} />
    </G>
  );
}

/** 22 · Synthesis: a crossroads with many signposts — each marked by an idea from an earlier lesson — and a lantern. */
function StrategicPractice({ glow }: ArtProps) {
  // Signs point right; `left` mirrors one about the post (x = 180).
  const sign = (y: number, r: number, color: string, glyph: ReactNode, left?: boolean) => (
    <G transform={left ? 'translate(360 0) scale(-1 1)' : undefined}>
      <G transform={`rotate(${r} 180 ${y})`}>
        <Path d={`M183 ${y - 7} L228 ${y - 7} L236 ${y} L228 ${y + 7} L183 ${y + 7} Z`} fill={C.mid} stroke={color} strokeWidth={1.2} />
        <G transform={`translate(206 ${y}) scale(${left ? -1 : 1} 1)`}>{glyph}</G>
      </G>
    </G>
  );
  return (
    <G>
      {/* Roads fanning out */}
      <Path d="M150 150 L176 118 L184 118 L210 150 Z" fill={C.mid} opacity={0.6} />
      <Path d="M176 118 L50 124 L50 132 Z" fill={C.mid} opacity={0.35} />
      <Path d="M184 118 L310 124 L310 132 Z" fill={C.mid} opacity={0.35} />
      <Rect x={177} y={34} width={6} height={84} fill={C.far} />
      {sign(42, -10, C.blue, <Rect x={-6} y={-4} width={12} height={8} fill="none" stroke={C.blue} strokeWidth={1.5} />)}
      {sign(64, 8, C.orange, <Path d="M-7 3 L0 -4 L7 3" stroke={C.orange} strokeWidth={1.8} fill="none" />)}
      {sign(52, 6, C.cyan, <Circle cx={0} cy={0} r={4} fill="none" stroke={C.cyan} strokeWidth={1.6} />, true)}
      {sign(76, -8, C.amber, <Path d="M-6 0 L6 0 M0 -4 L0 4" stroke={C.amber} strokeWidth={1.8} />, true)}
      <Halo x={250} y={96} r={30} glow={glow} />
      <Person x={248} y={122} color={C.blue} s={1.2} arm="out" />
      <G transform="translate(266 103)">
        <Line x1="0" y1="-10" x2="0" y2="-4" stroke={C.light} strokeWidth={1.2} />
        <Rect x={-4} y={-4} width={8} height={11} rx={2} fill={C.amber} />
      </G>
    </G>
  );
}

const ART: Partial<Record<LessonId, (p: ArtProps) => ReactNode>> = {
  'cooperation-trap': CooperationTrap,
  'iterated-dominance': IteratedDominance,
  'best-response': BestResponse,
  'coordination-problem': CoordinationProblem,
  'predictability-trap': PredictabilityTrap,
  'market-competition': MarketCompetition,
  evolution: Evolution,
  'sequential-moves': SequentialMoves,
  credibility: Credibility,
  'incentive-shift': IncentiveShift,
  bargaining: Bargaining,
  'war-of-attrition': WarOfAttrition,
  'repeated-cooperation': RepeatedCooperation,
  'strategy-detective': StrategyDetective,
  'bayesian-uncertainty': BayesianUncertainty,
  signaling: Signaling,
  auctions: Auctions,
  'market-quality': MarketQuality,
  coalitions: Coalitions,
  voting: Voting,
  brinkmanship: Brinkmanship,
  'strategic-practice': StrategicPractice,
};

/** Lessons that have their own thumbnail (for tests and the contact sheet). */
export const LESSONS_WITH_ART = Object.keys(ART) as LessonId[];
