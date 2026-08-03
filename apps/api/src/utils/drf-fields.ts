/**
 * DRF `serializers.CharField` の run_validation を忠実に再現するヘルパ。
 * バリデーションエラー文言・判定順を Django と byte 一致させるために使う。
 *
 * DRF の判定順（CharField.run_validation → super → to_internal_value → validators）:
 *   1. blank: data === "" もしくは trim_whitespace かつ strip 後が "" → 'blank'
 *   2. required/absent: キー無し → 'required'（required=True のとき）
 *   3. null: data === null かつ allow_null=False → 'null'
 *   4. invalid: bool もしくは str/number 以外 → 'invalid'（int/float は str へ強制変換）
 *   5. max_length: strip 後の長さで判定
 */
export type CharFieldOpts = {
  required?: boolean; // 既定 true
  allowBlank?: boolean; // 既定 false
  allowNull?: boolean; // 既定 false
  trimWhitespace?: boolean; // 既定 true
  maxLength?: number;
  minLength?: number;
};

export type CharFieldResult =
  | { kind: "absent" }
  | { kind: "value"; value: string }
  | { kind: "error"; message: string };

export function charField(
  body: Record<string, unknown>,
  key: string,
  opts: CharFieldOpts = {},
): CharFieldResult {
  const {
    required = true,
    allowBlank = false,
    allowNull = false,
    trimWhitespace = true,
    maxLength,
    minLength,
  } = opts;

  if (!(key in body)) {
    if (required) return { kind: "error", message: "This field is required." };
    return { kind: "absent" };
  }

  const data = body[key];

  // 1. blank（CharField.run_validation が super より先に判定）
  if (
    data === "" ||
    (trimWhitespace && typeof data === "string" && data.trim() === "")
  ) {
    if (!allowBlank) return { kind: "error", message: "This field may not be blank." };
    return { kind: "value", value: "" };
  }

  // 3. null
  if (data === null) {
    if (!allowNull) return { kind: "error", message: "This field may not be null." };
    return { kind: "value", value: "" };
  }

  // 4. invalid: bool、または str/number 以外は不可（int/float は str へ強制変換）
  if (typeof data === "boolean" || !(typeof data === "string" || typeof data === "number")) {
    return { kind: "error", message: "Not a valid string." };
  }

  let value = String(data);
  if (trimWhitespace) value = value.trim();

  // 5. max_length / min_length（strip 後の長さ = コードポイント数）
  const clen = [...value].length;
  if (maxLength !== undefined && clen > maxLength) {
    return {
      kind: "error",
      message: `Ensure this field has no more than ${maxLength} characters.`,
    };
  }
  if (minLength !== undefined && clen < minLength) {
    return {
      kind: "error",
      message: `Ensure this field has at least ${minLength} characters.`,
    };
  }

  return { kind: "value", value };
}

/**
 * DRF `serializers.IntegerField` を再現（required / min_value / max_value）。
 * int / 整数値の数値文字列 / 末尾 .0 の float は可。bool・非整数は 'invalid'。
 */
export type IntegerFieldOpts = {
  required?: boolean; // 既定 true
  minValue?: number;
  maxValue?: number;
};

export function integerField(
  body: Record<string, unknown>,
  key: string,
  opts: IntegerFieldOpts = {},
): CharFieldResult {
  const { required = true, minValue, maxValue } = opts;

  if (!(key in body)) {
    if (required) return { kind: "error", message: "This field is required." };
    return { kind: "absent" };
  }
  const data = body[key];
  if (data === null) return { kind: "error", message: "This field may not be null." };

  let n: number;
  if (typeof data === "boolean") return { kind: "error", message: "A valid integer is required." };
  if (typeof data === "number") {
    if (!Number.isInteger(data)) return { kind: "error", message: "A valid integer is required." };
    n = data;
  } else if (typeof data === "string" && /^\s*-?\d+\s*$/.test(data)) {
    n = parseInt(data.trim(), 10);
  } else {
    return { kind: "error", message: "A valid integer is required." };
  }

  if (maxValue !== undefined && n > maxValue)
    return {
      kind: "error",
      message: `Ensure this value is less than or equal to ${maxValue}.`,
    };
  if (minValue !== undefined && n < minValue)
    return {
      kind: "error",
      message: `Ensure this value is greater than or equal to ${minValue}.`,
    };

  // value は文字列表現で返す（呼び出し側で Number 変換）
  return { kind: "value", value: String(n) };
}

// Python の type(x).__name__ 相当（"Expected a list ..." メッセージ用）。
function pyTypeName(v: unknown): string {
  if (v === null) return "NoneType";
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (Array.isArray(v)) return "list";
  return "dict";
}

/**
 * DRF `serializers.ListField(child=serializers.IntegerField())` を再現。
 * - キー無し/None/非配列 → field レベルエラー（{key:[message]}）。
 * - child が整数化不能 → custom_exception_handler が nested dict を平坦化できず
 *   message="Bad Request"・fields 無しになる（kind:"flat"）。
 * - 正常 → 整数配列。
 */
export type IntIdListResult =
  | { kind: "field"; message: string }
  | { kind: "flat" }
  | { kind: "ok"; ids: number[] };

export function validateIntIdList(
  body: Record<string, unknown>,
  key: string,
): IntIdListResult {
  if (!(key in body)) return { kind: "field", message: "This field is required." };
  const v = body[key];
  if (v === null) return { kind: "field", message: "This field may not be null." };
  if (!Array.isArray(v))
    return {
      kind: "field",
      message: `Expected a list of items but got type "${pyTypeName(v)}".`,
    };

  const ids: number[] = [];
  for (const item of v) {
    // IntegerField: int / 整数化できる数値文字列は可。bool・小数・その他は不可。
    if (typeof item === "boolean") return { kind: "flat" };
    if (typeof item === "number") {
      if (!Number.isInteger(item)) return { kind: "flat" };
      ids.push(item);
    } else if (typeof item === "string" && /^\s*-?\d+\s*$/.test(item)) {
      ids.push(parseInt(item.trim(), 10));
    } else {
      return { kind: "flat" };
    }
  }
  return { kind: "ok", ids };
}
