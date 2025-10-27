import { test, expect } from '@playwright/test';

/**
 * VideosのE2Eテスト
 */
test.describe('Videos', () => {
  test.beforeEach(async ({ page }) => {
    // ログインページに移動
    await page.goto('/login');
    
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('**/', { timeout: 10000 });
  });

  test('動画一覧ページにアクセスできる', async ({ page }) => {
    // 動画一覧ページに移動
    await page.goto('/videos');
    
    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
    
    // ページが表示されていることを確認
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('ホームページから統計情報が表示される', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');
    
    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
    
    // 統計情報が表示されることを確認
    await expect(page.locator('text=/動画/, text=/グループ/').first()).toBeVisible({ timeout: 10000 });
  });
});

