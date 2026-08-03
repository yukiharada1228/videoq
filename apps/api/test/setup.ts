import { beforeEach } from "vitest";
import {
  createMemoryRateLimitBackend,
  setRateLimitBackendForTests,
} from "../src/lib/rate-limit";

/** メモリ・レート制限カウンタをテスト間で隔離する。 */
beforeEach(() => {
  setRateLimitBackendForTests(createMemoryRateLimitBackend());
});
