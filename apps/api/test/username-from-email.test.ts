import { describe, expect, it } from "vitest";
import { usernameFromEmail } from "../src/lib/auth";

describe("usernameFromEmail", () => {
  it("normalizes the local part", () => {
    expect(usernameFromEmail("Alice.Bob+tag@example.com")).toBe("alice_bob_tag");
  });

  it("pads short local parts", () => {
    expect(usernameFromEmail("ab@example.com").length).toBeGreaterThanOrEqual(3);
  });

  it("truncates long local parts", () => {
    const long = `${"a".repeat(200)}@example.com`;
    expect(usernameFromEmail(long).length).toBeLessThanOrEqual(150);
  });
});
