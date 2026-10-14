import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from '@/app/Root';
import { createChannel } from '@/lib/broadcast';
import { initTheme } from '@/lib/theme';
import { appStore } from '@/store/appStore';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import '@/styles/index.css';

initTheme();

// Another tab replaced, re-keyed or deleted the data: start over from storage.
createChannel().subscribe(() => window.location.reload());

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
