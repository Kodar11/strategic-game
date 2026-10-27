import type { MatchView } from '../useMatch';
import { RpsBoard } from './RpsBoard';
import { SplitStealBoard } from './SplitStealBoard';
import { StagHuntBoard } from './StagHuntBoard';
import { TwoThirdsBoard } from './TwoThirdsBoard';
import { UltimatumBoard } from './UltimatumBoard';

/** Each game has its own board; this only picks it. */
export function Board({ view }: { view: MatchView }) {
  switch (view.game) {
    case 'rps':
      return <RpsBoard view={view} />;
    case 'two-thirds':
      return <TwoThirdsBoard view={view} />;
    case 'split-steal':
      return <SplitStealBoard view={view} />;
    case 'ultimatum':
      return <UltimatumBoard view={view} />;
    case 'stag-hunt':
      return <StagHuntBoard view={view} />;
  }
}
