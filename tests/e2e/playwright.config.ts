import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'npx serve . -l 3000',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
