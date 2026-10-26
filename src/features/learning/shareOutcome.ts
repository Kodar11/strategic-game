/** What the export flow can honestly report. None of these claim a file was saved: the platform doesn't say. */
export type ShareOutcome =
  | { kind: 'sheet-closed' }
  | { kind: 'download-started' }
  | { kind: 'unavailable' }
  | { kind: 'serialize-error'; detail: string }
  | { kind: 'file-error'; detail: string }
  | { kind: 'share-error'; detail: string };

export function shareOutcomeMessage(outcome: ShareOutcome, fileName: string): string {
  switch (outcome.kind) {
    case 'sheet-closed':
      return `The share sheet closed. If you saved or sent ${fileName}, it’s wherever you chose.`;
    case 'download-started':
      return `Your browser was asked to download ${fileName}. Check your downloads.`;
    case 'unavailable':
      return 'Sharing files isn’t available here, so nothing was exported.';
    case 'serialize-error':
      return 'Your learning data couldn’t be prepared, so nothing was exported.';
    case 'file-error':
      return 'The export file couldn’t be created, so nothing was exported.';
    case 'share-error':
      return 'The share sheet couldn’t be opened, so nothing was exported.';
  }
}

export const isShareFailure = (o: ShareOutcome) => o.kind !== 'sheet-closed' && o.kind !== 'download-started';
