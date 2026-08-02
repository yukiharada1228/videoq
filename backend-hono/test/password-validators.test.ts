import { describe, it, expect } from "vitest";
import { validateDjangoPassword } from "../src/lib/password-validators";

// 期待値は実 Django validate_password(pw)（user=None）と一致（/tmp/pwval.py 済）。
describe("validateDjangoPassword", () => {
  const cases: [string, string[]][] = [
    ["short", ["This password is too short. It must contain at least 8 characters."]],
    ["password", ["This password is too common."]],
    ["12345678", ["This password is too common.", "This password is entirely numeric."]],
    [
      "1234567",
      [
        "This password is too short. It must contain at least 8 characters.",
        "This password is too common.",
        "This password is entirely numeric.",
      ],
    ],
    ["abcdefgh", ["This password is too common."]],
    ["00000000", ["This password is too common.", "This password is entirely numeric."]],
    ["Str0ng!Passw0rd-xyz", []],
  ];
  for (const [pw, expected] of cases) {
    it(`${JSON.stringify(pw)} → ${expected.length} error(s)`, () => {
      expect(validateDjangoPassword(pw)).toEqual(expected);
    });
  }

  it("非 common な純数字（長い）→ entirely numeric のみ", () => {
    // 999...（19桁, common リストに無い）
    const pw = "9".repeat(19);
    expect(validateDjangoPassword(pw)).toEqual(["This password is entirely numeric."]);
  });
});
