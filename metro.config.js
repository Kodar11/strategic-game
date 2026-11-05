// Expo's default Metro configuration, with PostHog's serializer: it stamps each bundle with a debug id so uploaded
// source maps match the exact bundle that reported an error (docs/OBSERVABILITY.md). Nothing else is customized.
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

module.exports = getPostHogExpoConfig(__dirname);
