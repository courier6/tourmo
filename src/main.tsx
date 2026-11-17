import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts ship with the app, so they load with no signal.
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './theme.css';
import './app.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { TourProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TourProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </TourProvider>
  </StrictMode>,
);
