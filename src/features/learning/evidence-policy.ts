/**
 * How much evidence each profile measure needs before the app says something about it. Every threshold the
 * Strategic Thinking Profile uses lives here, so the main profile, the detailed report and the tests agree.
 *
 * Evidence is always a *calculable first attempt*: the first answer to a question that could be worked out from the
 * information given (see profile.ts). Retries, replays and answers about unknowable outcomes never count.
 *
 * Levels, for any measure:
 * - `none`: nothing recorded.
 * - `activity`: something recorded, too little to interpret — show raw counts only, never a qualitative label.
 * - `tentative`: enough for a cautious, explicitly early observation with its sample size visible.
 * - `established`: enough for a plainer description. Still a description of answers, not of ability.
 */
export const EVIDENCE = {
  /**
   * A skill area. 2 answers can show an early pattern ("both matched") but not a strength; from 5, one different
   * answer moves the rate by 20 points or less (at 2–4 it moves it by 25–50), so a plainer description is fair.
   */
  area: { tentative: 2, established: 5 },
  /** All first attempts together: the scoped "N of M first attempts matched" line. */
  firstAttempts: { tentative: 4 },
  /** Confidence against results: answers overall before the section appears, and per confidence group compared. */
  confidence: { total: 4, group: 3 },
  /** Learning after feedback: questions first missed and then retried on the same content. */
  retried: 2,
  /** Transfer: different challenges (new situations) for one lesson concept. */
  transfer: 2,
  /** Progress over time: two windows of this length, each needing this many answers before they are compared. */
  trend: { windowDays: 28, perPeriod: 5 },
  /**
   * A percentage next to "N of M". Below 10, one answer moves it by more than 10 points, so the count alone is
   * clearer and less likely to be read as a score.
   */
  percent: 10,
  /**
   * The progress-over-time chart: calculable first attempts in time order, grouped into blocks of at least
   * `perPoint` answers. It needs `minPoints` blocks (15 answers) — fewer is a pair of numbers, not a trend — and
   * never draws more than `maxPoints`, so blocks grow as history grows. First and last block are only called
   * different when their match rates differ by `minChange` or more.
   */
  series: { perPoint: 5, minPoints: 3, maxPoints: 6, minChange: 0.2 },
  /**
   * Change within one area: its earlier and later halves of calculable first attempts, each with at least
   * `perHalf` answers. Only a gap of `minChange` or more is described as a change.
   */
  areaTrend: { perHalf: 4, minChange: 0.25 },
  /** Confidence bands are only contrasted when their match rates differ by this much. */
  calibrationGap: 0.2,
} as const;

export type EvidenceLevel = 'none' | 'activity' | 'tentative' | 'established';

/**
 * The level for a measure with `judged` calculable first attempts out of `recorded` answers of any kind.
 * Without an `established` threshold a measure never goes beyond `tentative`.
 */
export function evidenceLevel(recorded: number, judged: number, t: { tentative: number; established?: number }): EvidenceLevel {
  if (recorded === 0 && judged === 0) return 'none';
  if (judged < t.tentative) return 'activity';
  return t.established !== undefined && judged >= t.established ? 'established' : 'tentative';
}
