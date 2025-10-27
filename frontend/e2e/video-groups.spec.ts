import { test, expect } from '@playwright/test';

/**
 * VideoGroupsのE2Eテスト
 */
test.describe('Video Groups', () => {
  test.beforeEach(async ({ page }) => {
    // ログインページに移動
    await page.goto('/login');
  });

  test('グループ一覧ページが表示される', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('**/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups');
    
    // ページタイトルを確認
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('グループを作成できる', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('**/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups');
    
    // グループ作成ボタンを探してクリック
    const createButton = page.locator('button:has-text("グループを作成"), button:has-text("作成")').first();
    await createButton.click();
    
    // モーダルが表示されるまで待つ
    await page.waitForSelector('input[placeholder*="名前"], input[type="text"]', { timeout: 5000 });
    
    // グループ名を入力
    await page.fill('input[type="text"]:first-of-type', 'E2E Test Group');
    
    // 説明を入力
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('E2E Test Description');
    }
    
    // 作成ボタンをクリック
    const submitButton = page.locator('button[type="submit"]').last();
    await submitButton.click();
    
    // 作成成功メッセージまたはページ遷移を待つ
    await page.waitForTimeout(2000);
    
    // ページが更新されたことを確認
    await expect(page.locator('text=E2E Test Group').first()).toBeVisible({ timeout: 10000 });
  });

  test('グループ詳細ページにアクセスできる', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('**/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups');
    
    // ローディングが完了するまで待つ
    await page.waitForTimeout(2000);
    
    // グループカードが表示されている場合、クリック
    const groupCard = page.locator('[class*="Card"], [class*="card"]').first();
    if (await groupCard.count() > 0) {
      await groupCard.click();
      
      // URLが変更されていることを確認
      await expect(page).toHaveURL(/\/videos\/groups\/\d+/);
    } else {
      // グループがない場合はスキップ
      test.skip();
    }
  });

  test('グループページでローディング状態が表示される', async ({ page }) => {
    // ログイン処理
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    
    // ホームページに遷移するのを待つ
    await page.waitForURL('**/', { timeout: 10000 });
    
    // グループページに移動
    await page.goto('/videos/groups');
    
    // ページが完全に読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
    
    // ローディングスピナーが最終的に消えることを確認
    await expect(page.locator('[class*="spinner"], [class*="loading"]')).toHaveCount(0, { timeout: 10000 });
  });
});

