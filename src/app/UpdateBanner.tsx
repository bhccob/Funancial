import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { useUpdateOffer } from './useUpdateOffer';

/**
 * A soft gradient card, shown only in a release build when the download page has a newer version.
 * Update is a plain link: on the phone, Capacitor hands an off-site link to the system browser,
 * which downloads the file. Not now hides this version for good; a newer one shows again.
 */
export function UpdateBanner() {
  const { offer, dismiss } = useUpdateOffer();
  if (!offer) return null;
  return (
    <Banner
      tone="info"
      title={`Version ${offer.versionName} is ready`}
      action={
        <div className="flex gap-2">
          <Button variant="banner" aria-label="Not now, hide the update notice" onClick={dismiss}>
            Not now
          </Button>
          <a
            href={offer.apkUrl}
            className="bg-primary text-primary-contrast inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-bold whitespace-nowrap hover:opacity-90"
          >
            Update
          </a>
        </div>
      }
      className="mb-4"
    >
      <p className="line-clamp-3">{offer.notes}</p>
    </Banner>
  );
}
