import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from '@/app/Root';
import { initTheme } from '@/lib/theme';
import '@/styles/index.css';

initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
