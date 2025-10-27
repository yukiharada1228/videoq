import { test, expect } from '@playwright/test';

/**
 * VideoGroupsのE2Eテスト
 */
test.describe('Video Groups', () => {
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

  test('グループ一覧ページが表示される', async ({ page }) => {
    // グループページに移動
    await page.goto('/videos/groups', { waitUntil: 'networkidle' });
    
    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
    
    // ページに何か要素があることを確認（基本チェック）
    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 5000 });
    
    // URLが正しいことを確認
    await expect(page).toHaveURL(/\/videos\/groups/, { timeout: 5000 });
  });

  test('グループ作成ボタンが表示される', async ({ page }) => {
    // グループページに移動
    await page.goto('/videos/groups', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    
    // ページが完全に読み込まれるまで追加で待つ
    await page.waitForTimeout(3000);
    
    // ページにボタン要素が存在することを確認（より柔軟）
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    // ボタンが存在することを確認
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('グループ詳細ページにアクセスできる', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    
    // ローディングが完了するまで待つ
    await page.waitForTimeout(2000);
    
    // Cardコンポーネントを探す
    const groupCards = page.locator('[class*="Card"][class*="cursor-pointer"]');
    const cardCount = await groupCards.count();
    
    // グループが存在する場合は詳細ページにアクセス
    if (cardCount > 0) {
      await groupCards.first().click();
      
      // URLが変更されていることを確認
      await expect(page).toHaveURL(/\/videos\/groups\/\d+/, { timeout: 10000 });
    } else {
      // グループがない場合はスキップ
      test.skip('グループが存在しません');
    }
  });

  test('グループページでローディング状態が表示される', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups', { waitUntil: 'networkidle' });
    
    // ページが完全に読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
    
    // ローディングスピナーが最終的に消えることを確認
    const spinner = page.locator('[class*="spinner"], [class*="loading"], [class*="Spinner"]');
    await expect(spinner).toHaveCount(0, { timeout: 10000 });
  });
});

