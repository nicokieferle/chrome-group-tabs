import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src/test/browser',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH,
          args: process.env.PW_CHROMIUM_ARGS
            ? (JSON.parse(process.env.PW_CHROMIUM_ARGS) as string[])
            : undefined,
        }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
