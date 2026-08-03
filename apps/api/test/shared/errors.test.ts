import { describe, it, expect } from "vitest";
import {
  ApiError,
  errorBodySchema,
  toErrorBody,
} from "../../src/shared/errors";

describe("shared/errors", () => {
  it("toErrorBody builds the new error envelope", () => {
    expect(toErrorBody("NOT_FOUND", "Not found")).toEqual({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });

  it("toErrorBody omits details when undefined", () => {
    const body = toErrorBody("VALIDATION_ERROR", "Invalid", undefined);
    expect(body.error).not.toHaveProperty("details");
  });

  it("toErrorBody includes details when provided", () => {
    const details = { field: ["required"] };
    expect(toErrorBody("VALIDATION_ERROR", "Invalid", details)).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid", details },
    });
  });

  it("errorBodySchema validates the contract shape", () => {
    const parsed = errorBodySchema.parse(
      toErrorBody("UNAUTHORIZED", "Unauthorized"),
    );
    expect(parsed.error.code).toBe("UNAUTHORIZED");
  });

  it("ApiError carries status and code", () => {
    const err = new ApiError(404, "NOT_FOUND", "Missing resource");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Missing resource");
  });
});
