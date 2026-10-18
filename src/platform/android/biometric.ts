import type { BiometricVault } from '../types';

/** The plugin loads on first use, like the others: the web bundle and unit tests never load it. */
const plugin = () => import('@capgo/capacitor-native-biometric');

/** NO_PROTECTED_CREDENTIALS_FOUND: nothing is kept under the key, or the enrolment changed. */
const GONE = '21';

/** The plugin's error code. A bridge rejection carries it as a string, when it carries one at all. */
function codeOf(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined;
}

/**
 * Fingerprint or face unlock through the Android Keystore. The secret is encrypted with a
 * Keystore key that only a successful biometric check releases (a `CryptoObject` bound to that
 * one read), and that the system invalidates when the enrolled fingerprints or face change.
 */
export const androidBiometric: BiometricVault = {
  async available() {
    const { NativeBiometric } = await plugin();
    const result = await NativeBiometric.isAvailable();
    // A read bound to the Keystore key accepts only strong (Class 3) biometrics; a weak-only face
    // unlock reports `isAvailable` but could never release the secret.
    return result.isAvailable && result.strongBiometryIsAvailable;
  },

  async store(slot, secret) {
    const { NativeBiometric, AccessControl } = await plugin();
    await NativeBiometric.setData({
      key: slot,
      value: secret,
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      title: 'Turn on biometric unlock',
    });
  },

  async read(slot) {
    const { NativeBiometric } = await plugin();
    try {
      const { value } = await NativeBiometric.getSecureData({
        key: slot,
        title: 'Unlock Funcial',
        negativeButtonText: 'Use PIN',
      });
      return { status: 'ok', secret: value };
    } catch (e) {
      if (codeOf(e) === GONE) return { status: 'changed' };
      // The first read after an enrolment change fails with a generic code, once the plugin has
      // already deleted the invalidated copy; only later reads say 21. A copy that is no longer
      // there is gone, whatever the code; a copy still there was a cancelled or failed prompt.
      const { isSaved } = await NativeBiometric.isDataSaved({ key: slot }).catch(() => ({
        isSaved: true,
      }));
      return isSaved ? { status: 'cancelled' } : { status: 'changed' };
    }
  },

  async forget(slot) {
    const { NativeBiometric } = await plugin();
    await NativeBiometric.deleteData({ key: slot });
  },
};
