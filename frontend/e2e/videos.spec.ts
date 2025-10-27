import { test, expect } from '@playwright/test';

/**
 * VideosのE2Eテスト
 */
test.describe('Videos', () => {
  test.beforeEach(async ({ page }) => {
    // ログインページに移動
    await page.goto('/login');
    
    // ログインフォームが表示されるまで待つ
    await page.waitForSelector('form', { timeout: 5000 });
    
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('動画一覧ページにアクセスできる', async ({ page }) => {
    // 動画一覧ページに移動
    await page.goto('/videos', { waitUntil: 'networkidle' });
    
    // ページが読み込まれるまで待つ
    await page.waitForLoadState('domcontentloaded');
    
    // "動画一覧"というヘッダーが表示されていることを確認
    const heading = page.locator('h1:has-text("動画一覧")');
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('ホームページから統計情報が表示される', async ({ page }) => {
    // ホームページに移動
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // ページが読み込まれるまで待つ
    await page.waitForLoadState('domcontentloaded');
    
    // "動画"という文字が表示されることを確認（統計情報の一部）
    const statsSection = page.locator('text=動画, text=本の動画').first();
    await expect(statsSection).toBeVisible({ timeout: 10000 });
  });
});

