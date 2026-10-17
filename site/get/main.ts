import './page.css';
import { loadLatest, metaLine } from './latest';
import { platformOf } from './platform';
import { mountStaticPhones } from './screens';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

mountStaticPhones(el('stops'));

const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);

void loadLatest().then((latest) => {
  const link = el<HTMLAnchorElement>('download-link');
  // An iPhone gets only the note; everyone else gets the file, or "Coming soon" until there is one.
  const offer = platform !== 'ios';
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
});
