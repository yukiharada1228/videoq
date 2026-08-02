import { DurableObject } from "cloudflare:workers";

/**
 * 固定キー単位のスライディング・ウィンドウ・レート制限（DRF SimpleRateThrottle 相当）。
 * Worker 側は `idFromName(scope:ident)` で 1 キー = 1 DO にシャーディングする。
 */
export class RateLimiter extends DurableObject {
  /**
   * 1 リクエスト分を消費する。超過時は `allowed: false` と Retry-After 秒を返す。
   */
  async consume(
    limit: number,
    windowSec: number,
  ): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const now = Date.now() / 1000;
    const history = (await this.ctx.storage.get<number[]>("history")) ?? [];
    const cutoff = now - windowSec;

    // DRF: newest-first。末尾（最古）がウィンドウ外なら pop。
    while (history.length > 0 && history[history.length - 1]! <= cutoff) {
      history.pop();
    }

    if (history.length >= limit) {
      const oldest = history[history.length - 1]!;
      const retryAfterSec = Math.max(1, Math.ceil(windowSec - (now - oldest)));
      return { allowed: false, retryAfterSec };
    }

    history.unshift(now);
    await this.ctx.storage.put("history", history);
    // ウィンドウ経過後にストレージを掃除（任意）。最低 60s。
    try {
      await this.ctx.storage.setAlarm(Date.now() + Math.max(windowSec, 60) * 1000);
    } catch {
      /* alarm 未対応環境は無視 */
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  async alarm(): Promise<void> {
    const history = (await this.ctx.storage.get<number[]>("history")) ?? [];
    if (history.length === 0) {
      await this.ctx.storage.deleteAll();
      return;
    }
    // まだ履歴があれば次のウィンドウまで延長。
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}
