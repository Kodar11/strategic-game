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
