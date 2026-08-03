import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { validatePassword } from "../src/lib/password-validators";

describe("native password format", () => {
  it("round-trips and rejects legacy/incorrect values", async () => {
    const encoded = await hashPassword("a-long-native-password");
    expect(encoded).toMatch(/^vqpw\$1\$100000\$/);
    expect(await verifyPassword("a-long-native-password", encoded)).toBe(true);
    expect(await verifyPassword("wrong-password", encoded)).toBe(false);
    expect(
      await verifyPassword(
        "password",
        "unsupported-password-format",
      ),
    ).toBe(false);
  });

  it("applies the application policy", () => {
    expect(validatePassword("short")).not.toEqual([]);
    expect(validatePassword("123456789012")).not.toEqual([]);
    expect(validatePassword("correct horse battery staple")).toEqual([]);
  });
});
