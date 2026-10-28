import { DataError, toDataError } from './errors.ts';
import type { Rpc } from './repositories.ts';

/**
 * Deleting the signed-in (anonymous) account. The server function `delete_my_account` takes no arguments: it deletes
 * whoever the request's session belongs to, with everything tied to that account
 * (supabase/migrations/20261028140000_delete_account.sql). The app never deletes anything itself.
 */
export interface AccountRepository {
  /** Resolves only once the server has deleted the account (or it no longer exists). Throws a DataError otherwise. */
  deleteMyAccount(): Promise<void>;
}

export function accountRepository(rpc: Rpc): AccountRepository {
  return {
    async deleteMyAccount() {
      let result: unknown;
      try {
        result = await rpc.call('delete_my_account');
      } catch (e) {
        // A retry after a lost response: the account is already gone, which is what was asked for.
        if (/account:not_found/.test(String((e as { message?: unknown })?.message ?? ''))) return;
        throw toDataError(e);
      }
      if ((result as { deleted?: unknown } | null)?.deleted !== true) throw new DataError('server', `unexpected response: ${JSON.stringify(result)}`);
    },
  };
}

/** What to tell the player when deletion fails. Every case says the account may still exist, never that it's gone. */
export function accountDeletionError(e: unknown): string {
  const d = toDataError(e);
  switch (d.kind) {
    case 'network':
      return 'Couldn’t reach the server, so your account wasn’t deleted. Check your connection and try again.';
    case 'auth':
      return 'Your session couldn’t be confirmed, so nothing was deleted. Close and reopen the app, then try again.';
    case 'config':
      return d.message;
    default:
      return 'The server couldn’t delete your account. Nothing was removed. Try again later.';
  }
}
