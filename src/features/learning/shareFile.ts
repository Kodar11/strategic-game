import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ShareOutcome } from './shareOutcome';

/** Cached export files (exportFileName in records.ts) hold the learner's answers, so they belong to the account. */
export const EXPORT_FILE_PATTERN = /^strategic-thinking-data-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Deletes exported learning-data files left in the app cache (src/data/device-data.ts, scope `account`): on sign-out,
 * account deletion and an owner change. Never throws; a file that can't be deleted is left for the OS to clear.
 */
export function clearExportFiles(): void {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && EXPORT_FILE_PATTERN.test(entry.name)) {
        try {
          entry.delete();
        } catch {
          // Leave it; the OS clears the cache eventually.
        }
      }
    }
  } catch {
    // No cache directory, or it can't be listed: nothing to clear.
  }
}

/**
 * Native (iOS/Android): write the JSON to the app's cache and open the system share sheet, where the learner
 * chooses to save it to Files, send it, or cancel. `shareAsync` doesn't report which, so neither do we.
 */
export async function shareJsonFile(json: string, fileName: string): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return { kind: 'unavailable' };
  let uri: string;
  try {
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(json);
    uri = file.uri;
  } catch (error) {
    return { kind: 'file-error', detail: String(error) };
  }
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export learning data' });
    return { kind: 'sheet-closed' };
  } catch (error) {
    return { kind: 'share-error', detail: String(error) };
  }
}
