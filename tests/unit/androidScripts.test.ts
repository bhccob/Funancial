import { describe, expect, it } from 'vitest';
import {
  chooseDevice,
  gradleCommand,
  javaProblem,
  parseAdbDevices,
} from '../../scripts/android.mjs';

describe('parseAdbDevices', () => {
  it('reads each device and its state, skipping the header and adb starting up', () => {
    const output = [
      '* daemon not running; starting now at tcp:5037',
      '* daemon started successfully',
      'List of devices attached',
      'R58M12ABCDE\tdevice',
      'emulator-5554\toffline',
      '0123456789\tunauthorized',
      '',
    ].join('\r\n');

    expect(parseAdbDevices(output)).toEqual([
      { serial: 'R58M12ABCDE', state: 'device' },
      { serial: 'emulator-5554', state: 'offline' },
      { serial: '0123456789', state: 'unauthorized' },
    ]);
  });

  it('finds none in an empty list', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

describe('chooseDevice', () => {
  const phone = { serial: 'R58M12ABCDE', state: 'device' };
  const emulator = { serial: 'emulator-5554', state: 'device' };

  it('picks the one device that is ready', () => {
    expect(chooseDevice([phone], undefined)).toEqual({ serial: 'R58M12ABCDE' });
    expect(chooseDevice([phone, { serial: 'emulator-5554', state: 'offline' }], '')).toEqual({
      serial: 'R58M12ABCDE',
    });
  });

  it('asks for ANDROID_SERIAL when more than one is ready, naming them', () => {
    const choice = chooseDevice([phone, emulator], undefined);
    expect(choice).toEqual({ error: expect.stringContaining('ANDROID_SERIAL') });
    expect(choice).toEqual({ error: expect.stringContaining('R58M12ABCDE') });
    expect(choice).toEqual({ error: expect.stringContaining('emulator-5554') });
  });

  it('takes ANDROID_SERIAL when it names a ready device', () => {
    expect(chooseDevice([phone, emulator], 'emulator-5554')).toEqual({ serial: 'emulator-5554' });
  });

  it('says so when ANDROID_SERIAL names a device that is missing or not ready', () => {
    expect(chooseDevice([phone], 'emulator-5554')).toEqual({
      error: expect.stringContaining('emulator-5554'),
    });
    expect(chooseDevice([{ serial: 'R58M12ABCDE', state: 'unauthorized' }], 'R58M12ABCDE')).toEqual(
      { error: expect.stringContaining('unauthorized') },
    );
  });

  it('says what to do when no device is ready', () => {
    expect(chooseDevice([], undefined)).toEqual({
      error: expect.stringContaining('USB debugging'),
    });
    const unauthorized = chooseDevice(
      [{ serial: 'R58M12ABCDE', state: 'unauthorized' }],
      undefined,
    );
    expect(unauthorized).toEqual({ error: expect.stringContaining('R58M12ABCDE  unauthorized') });
    expect(unauthorized).toEqual({ error: expect.stringContaining('Allow') });
  });
});

describe('gradleCommand', () => {
  it('runs the batch wrapper through cmd on Windows, and the shell wrapper elsewhere', () => {
    // Node will not start a .bat file by itself.
    expect(gradleCommand('win32')).toEqual({ command: 'cmd', args: ['/c', 'gradlew.bat'] });
    expect(gradleCommand('linux')).toEqual({ command: './gradlew', args: [] });
    expect(gradleCommand('darwin')).toEqual({ command: './gradlew', args: [] });
  });
});

describe('javaProblem', () => {
  it('points at the setup guide when JAVA_HOME is not set', () => {
    expect(javaProblem({})).toMatch(/JAVA_HOME.*Java 21.*docs\/android\.md/s);
    expect(javaProblem({ JAVA_HOME: '' })).toMatch(/JAVA_HOME/);
    expect(javaProblem({ JAVA_HOME: 'C:\\Users\\me\\.jdks\\temurin-21.0.12.1' })).toBeNull();
  });
});
