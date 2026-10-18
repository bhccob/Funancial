import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessControl } from '@capgo/capacitor-native-biometric';
import { androidBiometric } from './biometric';

const native = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  setData: vi.fn(),
  getSecureData: vi.fn(),
  isDataSaved: vi.fn(),
  deleteData: vi.fn(),
}));

// The real enums stay (the code under test names `AccessControl.BIOMETRY_CURRENT_SET`); only the
// plugin object that would talk to the phone is replaced.
vi.mock('@capgo/capacitor-native-biometric', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capgo/capacitor-native-biometric')>()),
  NativeBiometric: native,
}));

const SLOT = 'funancial.real.unlock';

/** A rejection as it arrives over the Capacitor bridge: an error carrying the plugin's code as a string. */
const rejection = (code: string, message: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  vi.resetAllMocks();
  native.setData.mockResolvedValue(undefined);
  native.deleteData.mockResolvedValue(undefined);
  native.isDataSaved.mockResolvedValue({ isSaved: true });
});

describe('androidBiometric', () => {
  it('maps plugin results to ok, cancelled and changed', async () => {
    native.getSecureData.mockResolvedValueOnce({ value: 'S2V5' });
    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'ok', secret: 'S2V5' });
    expect(native.getSecureData).toHaveBeenCalledExactlyOnceWith({
      key: SLOT,
      title: 'Unlock Funcial',
      negativeButtonText: 'Use PIN',
    });

    native.getSecureData.mockRejectedValueOnce(rejection('21', 'No protected data found'));
    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'changed' });

    native.getSecureData.mockRejectedValueOnce(rejection('16', 'Cancel'));
    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'cancelled' });

    native.getSecureData.mockRejectedValueOnce(rejection('4', 'Too many failed attempts'));
    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'cancelled' });

    native.getSecureData.mockRejectedValueOnce({ message: 'Authentication failed' });
    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'cancelled' });
  });

  it('reads a copy the plugin threw away for a changed enrolment as changed', async () => {
    // The first read after an enrolment change fails with code 0, once the plugin has already
    // deleted the invalidated copy; only later reads say 21.
    native.getSecureData.mockRejectedValueOnce(rejection('0', 'Biometric enrollment changed'));
    native.isDataSaved.mockResolvedValueOnce({ isSaved: false });

    await expect(androidBiometric.read(SLOT)).resolves.toEqual({ status: 'changed' });
    expect(native.isDataSaved).toHaveBeenCalledWith({ key: SLOT });
  });

  it('keeps the secret behind the current enrolment and forgets it', async () => {
    await androidBiometric.store(SLOT, 'S2V5');
    expect(native.setData).toHaveBeenCalledExactlyOnceWith({
      key: SLOT,
      value: 'S2V5',
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      title: 'Turn on biometric unlock',
    });

    await androidBiometric.forget(SLOT);
    expect(native.deleteData).toHaveBeenCalledExactlyOnceWith({ key: SLOT });
  });

  it('is available only with a strong fingerprint or face, which the Keystore check needs', async () => {
    const result = (isAvailable: boolean, strongBiometryIsAvailable: boolean) => ({
      isAvailable,
      strongBiometryIsAvailable,
      authenticationStrength: 0,
      biometryType: 0,
      deviceIsSecure: true,
    });
    native.isAvailable
      .mockResolvedValueOnce(result(true, true))
      .mockResolvedValueOnce(result(true, false))
      .mockResolvedValueOnce(result(false, false));

    expect(await androidBiometric.available()).toBe(true);
    expect(await androidBiometric.available()).toBe(false);
    expect(await androidBiometric.available()).toBe(false);
  });

  it('reports a secret that cannot be kept', async () => {
    const failure = new Error('Failed to save data');
    native.setData.mockRejectedValueOnce(failure);

    await expect(androidBiometric.store(SLOT, 'S2V5')).rejects.toBe(failure);
  });
});
