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

/** Whether a WebGL 2 context can be made here, which is all Three.js (r163 and later) can use. */
function hasWebgl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Let the probe's context go; the story makes its own.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

// The 3D story is an extra on top of a page that is whole without it. It starts after the first
// paint, and only when motion is welcome and WebGL works: otherwise Three.js is never fetched.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && hasWebgl()) {
  const start = () =>
    requestAnimationFrame(() => {
      import('./story')
        .then(({ startStory }) => startStory(el('stage')))
        // The chunk did not arrive (offline, say): the page stays as it is.
        .catch(() => undefined);
    });
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}
