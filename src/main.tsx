import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from '@/app/Root';
import { tabChannel } from '@/lib/broadcast';
import { initTheme } from '@/lib/theme';
import { appStore } from '@/store/appStore';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import '@/styles/index.css';

initTheme();

// Another tab changed data: reload it. If it replaced, re-keyed or deleted the data, start over.
tabChannel().subscribe((m) => {
  if (m.reason === 'data') void appStore.getState().refresh();
  else window.location.reload();
});

// A new day (or time away) may have brought renewals, pay days and a new budget period.
const sync = () => void appStore.getState().sync();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sync();
});
window.addEventListener('focus', sync);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppStoreProvider store={appStore}>
      <Root />
    </AppStoreProvider>
  </StrictMode>,
);

void appStore.getState().boot();
