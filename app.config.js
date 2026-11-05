/**
 * Build-time additions to app.json (which stays the source of truth for everything else).
 *
 * 1. `extra.observability.environment` comes from the EAS build profile (development / preview / production), so a
 *    build always reports the environment it was built for — it can't be copied wrong between environments. Local
 *    `expo start` / `expo export` builds are `development`. `gitSha` is the commit EAS built from.
 * 2. The PostHog config plugin (`posthog-react-native/expo`) uploads JavaScript source maps and native debug symbols
 *    during release builds so crash stack traces are readable. Its upload step fails the build when PostHog
 *    credentials are missing, so it is added only when `POSTHOG_CLI_API_KEY` is present at build time (an EAS
 *    secret; see docs/OBSERVABILITY.md). Builds without it still work and still report errors — with minified
 *    stack traces.
 *
 * Never put the CLI key in an EXPO_PUBLIC_ variable: those are bundled into the app.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const environment = profile === 'production' || profile === 'preview' ? profile : 'development';
  const uploadSymbols = Boolean(process.env.POSTHOG_CLI_API_KEY);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ...(uploadSymbols ? [['posthog-react-native/expo', { uploadNativeSymbols: true }]] : [])],
    extra: {
      ...config.extra,
      observability: { environment, gitSha: process.env.EAS_BUILD_GIT_COMMIT_HASH ?? null },
    },
  };
};
