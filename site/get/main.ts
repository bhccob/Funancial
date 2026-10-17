import './page.css';
import type { Latest } from '@/domain/update';
import { loadLatest, metaLine } from './latest';
import { platformOf } from './platform';
import { mountStaticPhones } from './screens';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
// An iPhone gets only the note; everyone else gets the file, or "Coming soon" until there is one.
const offer = platform !== 'ios';

/** The compact button under the title: the file on a phone, a way down to the QR code on a computer. */
function showHero(latest: Latest | null) {
  const link = el<HTMLAnchorElement>('hero-download-link');
  link.hidden = !(offer && latest);
  el('hero-download-soon').hidden = !offer || latest !== null;
  if (!latest) return;
  if (platform === 'android') {
    link.href = latest.apkUrl;
    link.textContent = 'Download for Android';
  } else {
    link.href = '#download';
    link.textContent = 'Get it on your phone ↓';
  }
}

/** The full block at the end of the page. */
function showDownload(latest: Latest | null) {
  const link = el<HTMLAnchorElement>('download-link');
  el('download-qr').hidden = platform !== 'other';
  el('download-ios').hidden = offer;
  link.hidden = !(offer && latest);
  link.classList.toggle('quiet', platform === 'other');
  el('download-soon').hidden = !offer || latest !== null;
  el('download-meta').hidden = !(offer && latest);
  el('download-area').hidden = false;

  if (!latest) return;
  link.href = latest.apkUrl;
  el('download-meta').textContent = metaLine(latest);
  el('whats-new-notes').textContent = latest.notes;
  el('whats-new').hidden = false;
}

// The download comes first: nothing after this line may stop it.
void loadLatest().then((latest) => {
  showHero(latest);
  showDownload(latest);
});
el('hero-download-soon').hidden = !offer;
el('hero-download-ios').hidden = offer;

mountStaticPhones(el('stops'));
