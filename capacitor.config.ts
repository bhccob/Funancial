import type { CapacitorConfig } from '@capacitor/cli';

const devUrl = process.env.FUNANCIAL_DEV_URL;

export default {
  appId: 'io.github.bhccob.funancial',
  appName: 'Funancial',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: { androidIsEncryption: true, androidBiometric: { biometricAuth: false } },
    LocalNotifications: { smallIcon: 'ic_stat_reminder', iconColor: '#00B37E' },
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
  ...(devUrl ? { server: { url: devUrl, cleartext: true } } : {}),
} satisfies CapacitorConfig;
