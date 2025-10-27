import { test, expect } from '@playwright/test';

/**
 * 認証のE2Eテスト
 */
test.describe('Authentication', () => {
  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/login');
    
    // ログインフォームの要素が存在することを確認
    await expect(page.locator('input[name="username"], input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('ユーザー名とパスワードを入力できる', async ({ page }) => {
    await page.goto('/login');
    
    // ユーザー名を入力
    await page.fill('input[name="username"], input[type="text"]', 'testuser');
    
    // パスワードを入力
    await page.fill('input[type="password"]', 'testpass123');
    
    // 入力された値を確認
    await expect(page.locator('input[name="username"], input[type="text"]').first()).toHaveValue('testuser');
  });
});

