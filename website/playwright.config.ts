import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// End-to-end tests against the production build (bun run build first; CI does).
export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: { command: `bun run start -- -p ${PORT}`, port: PORT, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
