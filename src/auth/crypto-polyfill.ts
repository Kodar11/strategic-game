import * as Crypto from 'expo-crypto';

/**
 * React Native has no WebCrypto. supabase-js's PKCE flow (the Expo Go browser sign-in, src/auth/browser-sign-in.ts)
 * needs `crypto.getRandomValues` for the code verifier and `crypto.subtle.digest('SHA-256')` for the challenge;
 * without them it falls back to a weaker random source and the `plain` challenge method. This fills in just those two
 * from expo-crypto (OS cryptography; included in Expo Go), only where they are missing. Must run before the Supabase
 * client is created (src/data/supabase.ts). Browsers already have both, so the web build is untouched.
 */
export function installCryptoPolyfill(): void {
  const scope = globalThis as unknown as { crypto?: Record<string, unknown> };
  const crypto = (scope.crypto ??= {});

  if (typeof crypto.getRandomValues !== 'function') {
    crypto.getRandomValues = <T extends Parameters<typeof Crypto.getRandomValues>[0]>(array: T): T => Crypto.getRandomValues(array);
  }

  const subtle = crypto.subtle as { digest?: unknown } | undefined;
  if (typeof subtle?.digest !== 'function') {
    crypto.subtle = {
      ...subtle,
      digest: (algorithm: string | { name: string }, data: BufferSource): Promise<ArrayBuffer> => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') return Promise.reject(new Error(`Unsupported digest: ${name}`));
        return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
      },
    };
  }
}
