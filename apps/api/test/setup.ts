import { beforeEach } from "vitest";
import { resetMemoryRateLimits } from "../src/lib/rate-limit";

/** メモリ・レート制限カウンタをテスト間で隔離する。 */
beforeEach(() => {
  resetMemoryRateLimits();
});
