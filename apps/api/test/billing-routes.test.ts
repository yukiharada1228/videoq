import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingRoutes } from "../src/features/billing/routes";

const constructEventAsync = vi.fn();
const checkoutCreate = vi.fn();
const portalCreate = vi.fn();
const pricesList = vi.fn();
const customersCreate = vi.fn();
const subscriptionsRetrieve = vi.fn();

vi.mock("stripe", () => {
  class Stripe {
    static createFetchHttpClient() {
      return {};
    }
    webhooks = { constructEventAsync };
    checkout = { sessions: { create: checkoutCreate } };
    billingPortal = { sessions: { create: portalCreate } };
    prices = { list: pricesList };
    customers = { create: customersCreate };
    subscriptions = { retrieve: subscriptionsRetrieve };
    constructor() {}
  }
  return { default: Stripe };
});

import {
  executeFakePgQuery,
  type PgQueryInput,
  type QueryCall,
  type MatchableSql,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
        calls,
        sqlOrConfig: sqlOrConfig as PgQueryInput,
        args,
        rowsFor,
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-billing";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  BETTER_AUTH_SECRET: SECRET,
  FRONTEND_URL: "http://localhost",
  STRIPE_SECRET_KEY: "rk_test_billing",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_AUTOMATIC_TAX: "false",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  constructEventAsync.mockReset();
  checkoutCreate.mockReset();
  portalCreate.mockReset();
  pricesList.mockReset().mockResolvedValue({ data: [] });
  customersCreate.mockReset();
  subscriptionsRetrieve.mockReset();
  rowsFor = () => [];
});

const req = (path: string, init: RequestInit = {}) =>
  billingRoutes.request(path, init, ENV);

describe("billing API", () => {
  it("GET /plans はカタログを返す", async () => {
    const res = await req("/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { code: string; amount_yen: number }[] };
    expect(body.data.some((p) => p.code === "free" && p.amount_yen === 0)).toBe(true);
    expect(body.data.some((p) => p.code === "basic" && p.amount_yen === 1480)).toBe(true);
    expect(body.data.some((p) => p.code === "pro" && p.amount_yen === 3980)).toBe(true);
  });

  it("未ログインの checkout は 401", async () => {
    const res = await req("/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lookup_key: "basic_monthly" }),
    });
    expect(res.status).toBe(401);
  });

  it("webhook は署名ヘッダなしで 400", async () => {
    const res = await req("/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("重複 event は再処理しない", async () => {
    constructEventAsync.mockResolvedValue({
      id: "evt_1",
      type: "invoice.paid",
      data: { object: { customer: "cus_1", parent: null } },
    });
    rowsFor = (sql) => {
      if (sql.includes("INSERT") && sql.includes("stripe_events")) return [];
      return [];
    };
    const res = await req("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=abc",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
