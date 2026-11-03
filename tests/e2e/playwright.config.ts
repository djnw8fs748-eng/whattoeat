import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    // Build the React app, then serve the finished site (dist/) — the same
    // files the Docker image ships. Run `npm ci` in the repo root first.
    command: 'npm --prefix ../.. run build && npx serve ../../dist -l 3000',
    cwd: __dirname,
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
