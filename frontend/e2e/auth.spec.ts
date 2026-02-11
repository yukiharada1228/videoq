
import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {

    test('Login Page', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveTitle(/VideoQ/);
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();

        // Links
        await expect(page.locator('a[href="/signup"]')).toBeVisible();
        await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    });

    test('Signup Page', async ({ page }) => {
        await page.goto('/signup');
        await expect(page).toHaveTitle(/VideoQ/);

        // Check for email, username, password inputs
        // Using getByLabel if possible, but placeholder is safer if label matching is tricky with i18n key
        // We assume field names are stable
        await expect(page.locator('input[name="email"]')).toBeVisible();
        await expect(page.locator('input[name="username"]')).toBeVisible();
        // Assuming multiple password fields
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();

        await expect(page.locator('button[type="submit"]')).toBeVisible();
        await expect(page.locator('a[href="/login"]')).toBeVisible();
    });

    test('Forgot Password Page', async ({ page }) => {
        await page.goto('/forgot-password');
        await expect(page).toHaveTitle(/VideoQ/);
        // Using getByRole is more accessible and robust
        await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('Signup Check Email Page', async ({ page }) => {
        // This page is usually shown after signup, but we can visit it directly
        await page.goto('/signup/check-email');
        await expect(page).toHaveTitle(/VideoQ/);
        // It usually contains a message about checking email
        await expect(page.locator('body')).toContainText(/email|check/i);
    });

    test('Verify Email Page', async ({ page }) => {
        // Needs params usually, but should load
        await page.goto('/verify-email');
        // Might redirect or show error/loading
        await expect(page).toHaveTitle(/VideoQ/);
    });

    test('Reset Password Page', async ({ page }) => {
        // Needs token usually
        await page.goto('/reset-password');
        await expect(page).toHaveTitle(/VideoQ/);
    });

});
