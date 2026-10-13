// Adds build-time settings to app.json. Test builds (any EAS profile but "production", and local builds) may talk to a
// server over plain http, so the installed app works with the server on a computer in the office Wi-Fi.
// The store build only talks https.
module.exports = ({ config }) => {
  const testBuild = process.env.EAS_BUILD_PROFILE !== 'production';
  // Each build on GitHub gets the next number, so a newer APK installs over an older one as an update.
  const build = Number(process.env.ANDROID_BUILD_NUMBER) || undefined;
  return {
    ...config,
    android: { ...config.android, ...(build ? { versionCode: build } : {}) },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        // Plain http only to addresses in the local network (192.168.x.x and the like).
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: testBuild } }]],
  };
};
