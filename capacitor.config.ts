import type { CapacitorConfig } from '@capacitor/cli';

const devUrl = process.env.FUNANCIAL_DEV_URL;

export default {
  appId: 'io.github.bhccob.funancial',
  appName: 'Funcial',
  webDir: 'dist',
  // Logging on (the default in a debug build) writes every plugin call and result to the WebView
  // console and logcat, and those carry key material: the biometric copy of the data key, the
  // device key over the SQLite bridge. Off in every build.
  loggingBehavior: 'none',
  plugins: {
    CapacitorSQLite: { androidIsEncryption: true, androidBiometric: { biometricAuth: false } },
    LocalNotifications: { smallIcon: 'ic_stat_reminder', iconColor: '#00B37E' },
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
  ...(devUrl ? { server: { url: devUrl, cleartext: true } } : {}),
} satisfies CapacitorConfig;
