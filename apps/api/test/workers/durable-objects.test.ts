import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("RateLimiter Durable Object", () => {
  it("atomically enforces cost and keeps state across eviction", async () => {
    const stub = env.RATE_LIMITER.getByName("runtime-rate-limit");

    await expect(stub.consume(2, 60)).resolves.toEqual({
      allowed: true,
      retryAfterSec: 0,
    });
    await expect(stub.consume(2, 60, 2)).resolves.toMatchObject({
      allowed: false,
    });

    await evictDurableObject(stub);
    await expect(stub.snapshot()).resolves.toMatchObject({ count: 1 });

    await stub.release(60, 1);
    await expect(stub.snapshot()).resolves.toBeNull();
  });

  it("schedules and executes its cleanup alarm", async () => {
    const stub = env.RATE_LIMITER.getByName("runtime-rate-limit-alarm");
    await stub.consume(2, 60);

    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.getAlarm()).resolves.toBeTypeOf("number");
    });
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await expect(stub.snapshot()).resolves.toMatchObject({ count: 1 });
  });
});

describe("StudySession Durable Object", () => {
  it("expires progress at the stored deadline and renews it only on a successful commit", async () => {
    const stub = env.STUDY_SESSION.getByName("runtime-study-expiry");
    const readExpiry = () => runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ expires_at: number }>("SELECT expires_at FROM session_state WHERE id = 1").one().expires_at);
    const before = Date.now();
    await stub.tryAcquire("first");
    const first = await stub.commit(0, {}, "first");
    expect(first).not.toBe(false);
    if (!first) throw new Error("commit failed");
    expect(first.expiresAt).toBeGreaterThanOrEqual(before + 12 * 60 * 60 * 1000);
    expect(first.expiresAt).toBeLessThanOrEqual(Date.now() + 12 * 60 * 60 * 1000);
    expect(await readExpiry()).toBe(first.expiresAt);

    await stub.tryAcquire("next");
    await expect(stub.commit(0, {}, "next")).resolves.toBe(false);
    expect(await readExpiry()).toBe(first.expiresAt);
    await stub.release("next");
    await stub.getSnapshot();
    expect(await readExpiry()).toBe(first.expiresAt);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE session_state SET expires_at = ?", Date.now());
    });
    await expect(stub.getSnapshot()).resolves.toEqual({ revision: 0, states: {} });
    await stub.tryAcquire("fresh");
    await expect(stub.commit(0, {}, "fresh")).resolves.toEqual({ expiresAt: expect.any(Number) });
    await expect(stub.getSnapshot()).resolves.toEqual({ revision: 1, states: {} });
  });

  it("cleans up expired progress through its alarm without restoring it", async () => {
    const stub = env.STUDY_SESSION.getByName("runtime-study-expired-alarm");
    await stub.tryAcquire("turn");
    await stub.commit(0, {}, "turn");
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE session_state SET expires_at = ?", Date.now() - 1);
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.getSnapshot()).resolves.toEqual({ revision: 0, states: {} });
  });

  it("serializes turns and persists revisions across eviction", async () => {
    const stub = env.STUDY_SESSION.getByName("runtime-study-session");
    const states = {
      intro: {
        concept_id: 1,
        reached: true,
        hint_index: 0,
        last_grade: "pass",
        active: true,
      },
    };

    await expect(stub.tryAcquire("turn-1")).resolves.toEqual({
      acquired: true,
      retryAfterMs: 0,
    });
    await expect(stub.tryAcquire("turn-2")).resolves.toMatchObject({
      acquired: false,
    });
    await expect(stub.commit(0, states, "turn-1")).resolves.toEqual({ expiresAt: expect.any(Number) });

    await evictDurableObject(stub);
    await expect(stub.getSnapshot()).resolves.toEqual({
      revision: 1,
      states,
    });

    await expect(stub.tryAcquire("turn-2")).resolves.toMatchObject({
      acquired: true,
    });
    await expect(stub.commit(0, states, "turn-2")).resolves.toBe(false);
    await stub.release("turn-2");
  });

  it("keeps a live session and reschedules its expiration alarm", async () => {
    const stub = env.STUDY_SESSION.getByName("runtime-study-session-alarm");
    await stub.tryAcquire("turn-1");
    await stub.commit(0, {}, "turn-1");

    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await expect(stub.getSnapshot()).resolves.toEqual({
      revision: 1,
      states: {},
    });
    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.getAlarm()).resolves.toBeTypeOf("number");
    });
  });
});

describe("TaskScheduler Durable Object", () => {
  const alarmOf = (stub: DurableObjectStub) =>
    runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());

  it("keeps the earliest requested wakeup when armed repeatedly", async () => {
    const stub = env.TASK_SCHEDULER.getByName("runtime-task-scheduler-arm");
    const soon = Date.now() + 60_000;

    await stub.armAt(soon);
    await expect(alarmOf(stub)).resolves.toBe(soon);

    // 後ろの時刻は無視する。張り直しで起床が先送りされると回復が遅れる。
    await stub.armAt(soon + 600_000);
    await expect(alarmOf(stub)).resolves.toBe(soon);

    // 前倒しは通す。バックオフ明けを正確に拾うために必要。
    await stub.armAt(soon - 30_000);
    await expect(alarmOf(stub)).resolves.toBe(soon - 30_000);
  });

  it("clamps past timestamps so a stale request cannot spin the alarm", async () => {
    const stub = env.TASK_SCHEDULER.getByName("runtime-task-scheduler-floor");

    await stub.armAt(Date.now() - 600_000);

    const alarm = await alarmOf(stub);
    expect(alarm).toBeTypeOf("number");
    expect(alarm as number).toBeGreaterThan(Date.now());
  });

  it("survives eviction with its pending wakeup intact", async () => {
    const stub = env.TASK_SCHEDULER.getByName("runtime-task-scheduler-evict");
    const at = Date.now() + 3_600_000;

    await stub.armAt(at);
    await evictDurableObject(stub);

    await expect(alarmOf(stub)).resolves.toBe(at);
  });
});
