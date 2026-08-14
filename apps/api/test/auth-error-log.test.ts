import { describe, expect, it } from "vitest";
import { summarizeAuthApiError } from "../src/lib/auth-error-log";

describe("summarizeAuthApiError", () => {
  it("keeps the error name and drops the message", () => {
    const err = new Error(
      'duplicate key value violates unique constraint "users_email_key"',
    );
    expect(summarizeAuthApiError(err)).toEqual({ name: "Error" });
  });

  it("includes Postgres SQLSTATE and constraint name without DETAIL", () => {
    const err = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint: "users_email_key",
      detail: "Key (email)=(user@example.com) already exists.",
    });
    expect(summarizeAuthApiError(err)).toEqual({
      name: "Error",
      pgCode: "23505",
      constraint: "users_email_key",
    });
  });

  it("includes Better Auth body.code", () => {
    const err = Object.assign(new Error("unable to create user"), {
      body: { code: "unable_to_create_user" },
    });
    expect(summarizeAuthApiError(err)).toEqual({
      name: "Error",
      baCode: "unable_to_create_user",
    });
  });

  it("reads Postgres SQLSTATE from Error.cause (DrizzleQueryError)", () => {
    const cause = Object.assign(new Error("null value in column"), {
      code: "23502",
      constraint: "users_date_joined_not_null",
    });
    const err = Object.assign(new Error("Failed query: insert into \"users\""), {
      cause,
    });
    expect(summarizeAuthApiError(err)).toEqual({
      name: "Error",
      pgCode: "23502",
      constraint: "users_date_joined_not_null",
    });
  });
});
