import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ShareOutcome } from './shareOutcome';

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
