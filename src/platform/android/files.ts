import type { Platform } from '../types';

/** A share sheet the person backed out of is not a failure: nothing went wrong, nothing saved. */
function isCancellation(e: unknown): boolean {
  // A rejection from the bridge may be an Error or just a `{ message, code }` object.
  const message =
    typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e);
  return /cancel/i.test(message);
}

/**
 * Files leave the app through Android's share sheet. A download link does nothing in the WebView,
 * so the text is written to the app's cache and handed to the sheet, where the person picks
 * Files, Drive, an email app, and so on.
 *
 * The plugins load on first use: they are only needed when the person saves something. The sheet
 * works out the file's type from its name, so the mime type is not needed here.
 */
export const androidFiles: Platform['files'] = {
  save: async (fileName, text) => {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: fileName, files: [uri], dialogTitle: 'Save or send your file' });
      return 'saved';
    } catch (e) {
      if (isCancellation(e)) return 'cancelled';
      throw e;
    }
  },
};
