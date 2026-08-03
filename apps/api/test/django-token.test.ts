import { describe, it, expect } from "vitest";
import {
  makeDjangoToken,
  checkDjangoToken,
  makeEmailChangeToken,
  checkEmailChangeToken,
  decodeUidToPk,
  encodePkToUid,
} from "../src/lib/django-token";

// 実 Django default_token_generator._make_token_with_timestamp で生成した固定ベクトル。
// SECRET="fixed-test-secret-123", pk=42, password=..., email=v@example.com, last_login=None, TS=800000000
const ENV = { JWT_SECRET: "fixed-test-secret-123" } as unknown as Record<string, unknown>;
const EPOCH_2001 = Date.UTC(2001, 0, 1) / 1000; // 978307200
const USER = {
  pk: 42,
  password: "pbkdf2_sha256$1200000$saltsaltsalt$hashhashhash",
  email: "v@example.com",
  lastLogin: null,
};

describe("makeDjangoToken (default_token_generator 互換)", () => {
  it("固定ベクトルと byte 一致", async () => {
    const nowSec = 800000000 + EPOCH_2001;
    const token = await makeDjangoToken(ENV as never, USER, nowSec);
    expect(token).toBe("d8ary8-dbfe136f10e3d21cc40a7d2cb25225db");
  });

  it("フォーマット ts_b36-hash（hash は 32 hex）", async () => {
    const token = await makeDjangoToken(ENV as never, USER, 1778307200);
    const [ts, hash] = token.split("-");
    expect(ts.length).toBeGreaterThan(0);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("password 変更で token が変わる（ハッシュに password を含む）", async () => {
    const a = await makeDjangoToken(ENV as never, USER, 1778307200);
    const b = await makeDjangoToken(
      ENV as never,
      { ...USER, password: "pbkdf2_sha256$1200000$saltsaltsalt$DIFFERENT" },
      1778307200,
    );
    expect(a).not.toBe(b);
  });
});

describe("checkDjangoToken", () => {
  const TS = 800000000;
  const TOKEN = "d8ary8-dbfe136f10e3d21cc40a7d2cb25225db"; // 固定ベクトル（makeDjangoToken と対）
  const nowAt = (deltaSec: number) => TS + EPOCH_2001 + deltaSec;

  it("有効期限内は accept", async () => {
    expect(await checkDjangoToken(ENV as never, USER, TOKEN, nowAt(3600))).toBe(true);
  });
  it("3 日超過は reject（expired）", async () => {
    expect(await checkDjangoToken(ENV as never, USER, TOKEN, nowAt(4 * 86400))).toBe(false);
  });
  it("改竄トークンは reject", async () => {
    const tampered = TOKEN.slice(0, -1) + (TOKEN.endsWith("b") ? "c" : "b");
    expect(await checkDjangoToken(ENV as never, USER, tampered, nowAt(3600))).toBe(false);
  });
  it("password 変更後は reject（ハッシュ不一致）", async () => {
    expect(
      await checkDjangoToken(
        ENV as never,
        { ...USER, password: "pbkdf2_sha256$1200000$saltsaltsalt$CHANGED" },
        TOKEN,
        nowAt(3600),
      ),
    ).toBe(false);
  });
  it("形式不正は reject", async () => {
    expect(await checkDjangoToken(ENV as never, USER, "nodash", nowAt(0))).toBe(false);
    expect(await checkDjangoToken(ENV as never, USER, "a-b-c", nowAt(0))).toBe(false);
  });
});

// 実 Django の派生 EmailChangeTokenGenerator（hash value 末尾に pending_email）で生成した固定ベクトル。
describe("makeEmailChangeToken / checkEmailChangeToken", () => {
  const TS = 800000000;
  const nowAt = (deltaSec: number) => TS + EPOCH_2001 + deltaSec;
  const CHANGER = {
    pk: 42,
    password: "pbkdf2_sha256$1200000$saltsaltsalt$hashhashhash",
    email: "old@example.com",
    pendingEmail: "new@example.com",
    lastLogin: null as string | null,
  };
  const NO_LOGIN = "d8ary8-799a72aef0430522eeeb7305c528cdd1";
  const WITH_LOGIN = "d8ary8-15d22d535e7fc2cab41c25de7b5da74e";

  it("last_login=None の固定ベクトルと byte 一致", async () => {
    expect(await makeEmailChangeToken(ENV as never, CHANGER, nowAt(0))).toBe(NO_LOGIN);
  });

  it("last_login ありの固定ベクトルと byte 一致（UTC 'YYYY-MM-DD HH:MM:SS'）", async () => {
    const user = { ...CHANGER, lastLogin: "2026-08-01 15:30:45" };
    expect(await makeEmailChangeToken(ENV as never, user, nowAt(0))).toBe(WITH_LOGIN);
  });

  it("default 派生とは別トークン（取り違え不可）", async () => {
    // 同じ user を default_token_generator にかけた実 Django の値
    expect(await makeDjangoToken(ENV as never, CHANGER, nowAt(0))).toBe(
      "d8ary8-044b9729477f6f8a7d554b9ad8008c20",
    );
    expect(await checkDjangoToken(ENV as never, CHANGER, NO_LOGIN, nowAt(3600))).toBe(false);
    expect(await checkEmailChangeToken(ENV as never, CHANGER, NO_LOGIN, nowAt(3600))).toBe(true);
  });

  it("pending_email が変わると失効", async () => {
    const moved = { ...CHANGER, pendingEmail: "other@example.com" };
    expect(await checkEmailChangeToken(ENV as never, moved, NO_LOGIN, nowAt(3600))).toBe(false);
  });

  it("3 日超過は reject", async () => {
    expect(await checkEmailChangeToken(ENV as never, CHANGER, NO_LOGIN, nowAt(4 * 86400))).toBe(
      false,
    );
  });
});

// 既存ユーザー（last_login あり）へのパスワード再設定リンク用。
describe("makeDjangoToken（last_login あり）", () => {
  it("実 Django の固定ベクトルと byte 一致", async () => {
    const user = { ...USER, lastLogin: "2026-08-01 15:30:45" };
    const token = await makeDjangoToken(ENV as never, user, 800000000 + EPOCH_2001);
    expect(token).toBe("d8ary8-ed447950a8279e5c1a1bf5b416919cfe");
  });
});

describe("uid の base64url", () => {
  it("encode は urlsafe_base64_encode(force_bytes(pk)) と一致", () => {
    expect(encodePkToUid(42)).toBe("NDI");
    expect(encodePkToUid(12345)).toBe("MTIzNDU");
  });
  it("base64url(str(pk)) を復号", () => {
    expect(decodeUidToPk("NDI")).toBe(42); // "42"
    expect(decodeUidToPk("MQ")).toBe(1);
    expect(decodeUidToPk("MTIzNDU")).toBe(12345);
  });
  it("不正 uid は null", () => {
    expect(decodeUidToPk("!!!")).toBe(null);
    expect(decodeUidToPk("")).toBe(null);
  });
});
