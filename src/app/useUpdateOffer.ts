import { useEffect, useState } from 'react';
import { updateOffer, type Latest } from '@/domain/update';
import { safeStorage } from '@/lib/safeStorage';
import { usePlatform } from '@/platform/PlatformProvider';
import { fetchLatest, isReleaseBuild, updateUrl } from '@/services/update';

const DISMISSED_KEY = 'funancial.update.dismissed';

/** The version code the person last hid, or `null`. */
function readDismissed(): number | null {
  const code = Number.parseInt(safeStorage.get(DISMISSED_KEY) ?? '', 10);
  return Number.isNaN(code) ? null : code;
}

/**
 * The update to tell the person about, if any: a newer version than the installed build on the
 * download page, not one they hid with "Not now". Checked when the app opens and each time it comes
 * back. A build that is not a release build (the owner's phone) and a platform with no installed
 * build (the web) never check: no request is made.
 */
export function useUpdateOffer(): { offer: Latest | null; dismiss(): void } {
  const platform = usePlatform();
  const [found, setFound] = useState<{ latest: Latest; installed: number } | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (!isReleaseBuild()) return;
    // Numbers the checks. A check applies its answer only if no newer one started since (or the
    // app is gone, which bumps it), so a slow old answer cannot replace a newer one.
    let latestCheck = 0;
    const check = async () => {
      const mine = ++latestCheck;
      try {
        const installed = await platform.appVersion();
        if (!installed) return;
        const latest = await fetchLatest(updateUrl());
        if (mine === latestCheck && latest) setFound({ latest, installed: installed.code });
      } catch (e) {
        // A notice is a convenience; the next resume tries again.
        console.error('Could not check for an update', e);
      }
    };
    void check();
    const stop = platform.onResume(() => void check());
    return () => {
      latestCheck++;
      stop();
    };
  }, [platform]);

  const offer = found && updateOffer(found.latest, found.installed, dismissed);
  return {
    offer,
    dismiss() {
      if (!offer) return;
      safeStorage.set(DISMISSED_KEY, String(offer.versionCode));
      setDismissed(offer.versionCode);
    },
  };
}
