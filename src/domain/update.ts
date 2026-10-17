import { z } from 'zod';

/**
 * The `latest.json` on the download page, as the release script writes it. Anything else, from a
 * broken file to a hostile one, fails the parse. Unknown fields are dropped rather than refused, so
 * a later release can add one without hiding itself from the apps already installed.
 */
export const LatestSchema = z.object({
  versionCode: z.number().int().positive(),
  versionName: z.string().regex(/^[A-Za-z0-9._+-]{1,20}$/),
  notes: z.string().trim().min(1).max(500),
  apkUrl: z.url({ protocol: /^https?$/ }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive(),
});
export type Latest = z.infer<typeof LatestSchema>;

/** `latest`, when it is newer than the installed build and the person has not hidden that version. */
export function updateOffer(
  latest: Latest,
  installedCode: number,
  dismissedCode: number | null,
): Latest | null {
  return latest.versionCode > installedCode && latest.versionCode !== dismissedCode ? latest : null;
}
