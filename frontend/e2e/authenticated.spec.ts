
import { test, expect, type Page } from '@playwright/test';

// Define helper for logging in
async function login(page: Page) {
    await page.goto('/login');

    // Credentials from environment variables
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    if (!username || !password) {
        test.skip(!username || !password, 'TEST_USERNAME and TEST_PASSWORD must be set for authenticated tests');
        return;
    }

    // Fill login form
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);

    // Click login
    await page.click('button[type="submit"]');

    // Wait for redirect to home
    await page.waitForURL('/');

    // Verify home page content (e.g. welcome message)
    // We can't assume username text always, but H1 should be there
    await expect(page.locator('h1')).toBeVisible();
}

test.describe('Authenticated User Flow', () => {

    test.beforeEach(async () => {
        // Check if credentials are provided, otherwise skip
        if (!process.env.TEST_USERNAME || !process.env.TEST_PASSWORD) {
            test.skip();
        }
    });

    test('Can login successfully', async ({ page }) => {
        await login(page);
    });

    test('Can access protected Videos Page', async ({ page }) => {
        await login(page);

        // Navigate to videos page
        await page.goto('/videos');

        // Should NOT redirect to login
        await expect(page).toHaveURL(/\/videos/);

        // Should see "Upload" button or similar content specific to Videos page
        await expect(page.getByRole('button', { name: /upload|Upload|アップロード|＋/i })).toBeVisible();
    });

    test('Can access protected Video Groups Page', async ({ page }) => {
        await login(page);

        await page.goto('/videos/groups');
        await expect(page).toHaveURL(/\/videos\/groups/);

        // Check for "Create Group" button or title
        await expect(page.getByRole('button', { name: /create|new|作成/i })).toBeVisible();
    });

});
