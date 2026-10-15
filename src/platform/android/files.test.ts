import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Directory, Encoding } from '@capacitor/filesystem';
import { androidFiles } from './files';

const native = vi.hoisted(() => ({ writeFile: vi.fn(), share: vi.fn() }));

// The real enums stay (the code under test names `Directory.Cache` and `Encoding.UTF8`); only the
// plugin objects that would talk to the phone are replaced.
vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/filesystem')>()),
  Filesystem: { writeFile: native.writeFile },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));

const URI = 'file:///data/user/0/app.funancial/cache/funancial-backup-2026-10-15.funbak';

beforeEach(() => {
  vi.resetAllMocks();
  native.writeFile.mockResolvedValue({ uri: URI });
  native.share.mockResolvedValue({});
});

describe('androidFiles.save', () => {
  it('writes to the cache and opens the share sheet', async () => {
    await androidFiles.save('funancial-backup-2026-10-15.funbak', 'ENCRYPTED', 'application/octet-stream');

    expect(native.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'funancial-backup-2026-10-15.funbak',
      data: 'ENCRYPTED',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    expect(native.share).toHaveBeenCalledExactlyOnceWith({
      title: 'funancial-backup-2026-10-15.funbak',
      files: [URI],
      dialogTitle: 'Save or send your file',
    });
    expect(native.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      native.share.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each(['Share canceled', 'Share cancelled', 'The user CANCELED the share'])(
    'treats a cancelled share as fine (%s)',
    async (message) => {
      native.share.mockRejectedValue(new Error(message));

      await expect(
        androidFiles.save('export.json', '{}', 'application/json'),
      ).resolves.toBeUndefined();
    },
  );

  it('treats a cancellation that is not an Error object as fine too', async () => {
    native.share.mockRejectedValue({ message: 'Share canceled', code: 'UNAVAILABLE' });

    await expect(androidFiles.save('export.json', '{}', 'application/json')).resolves.toBeUndefined();
  });

  it('reports a failed write, and does not open the share sheet', async () => {
    const failure = new Error('No space left on device');
    native.writeFile.mockRejectedValue(failure);

    await expect(androidFiles.save('export.json', '{}', 'application/json')).rejects.toBe(failure);
    expect(native.share).not.toHaveBeenCalled();
  });

  it('reports a share that fails for any reason other than being cancelled', async () => {
    const failure = new Error('Activity not found');
    native.share.mockRejectedValue(failure);

    await expect(androidFiles.save('export.json', '{}', 'application/json')).rejects.toBe(failure);
  });
});
