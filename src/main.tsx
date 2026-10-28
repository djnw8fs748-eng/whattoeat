/* Entry point: loads Atlassian's base styles, applies the saved
   light/dark theme, then starts the React app inside <div id="root">. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset/dist/bundle.css';
import './styles.css';
import App from './App';
import { applyColorMode, getSavedColorMode } from './theme';

const initialMode = getSavedColorMode();

// Wait for the theme's tokens to load first so the page never renders unstyled.
applyColorMode(initialMode).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialColorMode={initialMode} />
    </StrictMode>,
  );
});
