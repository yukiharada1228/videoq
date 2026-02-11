
import { test, expect } from '@playwright/test';

test.describe('Protected Pages', () => {

    test('Videos Page Redirects to Login when Unauthenticated', async ({ page }) => {
        await page.goto('/videos');
        await expect(page).toHaveURL(/.*\/login/); // verify redirect
    });

    test('Video Groups Page Redirects to Login when Unauthenticated', async ({ page }) => {
        await page.goto('/videos/groups');
        await expect(page).toHaveURL(/.*\/login/); // verify redirect
    });

    test('Video Detail Page Redirects to Login when Unauthenticated', async ({ page }) => {
        await page.goto('/videos/123');
        await page.waitForURL(/.*\/login/);
    });

    test('Video Group Detail Page Redirects to Login when Unauthenticated', async ({ page }) => {
        await page.goto('/videos/groups/123');
        await page.waitForURL(/.*\/login/);
    });

    test('Home Page Redirects to Login when Unauthenticated', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/.*\/login/);
    });

});
