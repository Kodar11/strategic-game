import type { ShareOutcome } from './shareOutcome';

/**
 * Web: expo-file-system has no web implementation and expo-sharing can't share local files there, so the browser
 * downloads the JSON instead. The browser doesn't tell us whether the file was kept, so neither do we.
 */
export async function shareJsonFile(json: string, fileName: string): Promise<ShareOutcome> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { kind: 'unavailable' };
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { kind: 'download-started' };
  } catch (error) {
    return { kind: 'file-error', detail: String(error) };
  }
}
