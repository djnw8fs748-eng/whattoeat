/* Light/dark mode, using Atlassian's own theme switcher. setGlobalTheme
   swaps every design token (colours, shadows…) on the page at once, so
   Atlassian components and our own CSS both follow along. The choice is
   remembered in localStorage under the same key the old page used. */
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';

const STORAGE_KEY = 'wte-dark';

export type ColorMode = 'light' | 'dark';

export function getSavedColorMode(): ColorMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export async function applyColorMode(mode: ColorMode): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, mode === 'dark' ? '1' : '0');
  } catch {
    // Private browsing etc. — the theme still applies, it just isn't remembered.
  }
  await setGlobalTheme({
    colorMode: mode,
    light: 'light',
    dark: 'dark',
    spacing: 'spacing',
    shape: 'shape',
    typography: 'typography',
  });
  // index.html set a temporary background to avoid a flash; tokens take over now.
  document.documentElement.style.background = '';
}
