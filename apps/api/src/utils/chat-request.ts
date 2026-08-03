/**
 * `ChatRequestSerializer`（messages / group_id / mode / study_session_id）の DRF 再現。
 *
 * 2 つの出力形が必要になる:
 *   - 非ストリーミング: `is_valid(raise_exception=True)` → custom_exception_handler が
 *     {"error":{code,message,fields?}} に平坦化する（ネストは Python の repr 文字列になる）。
 *   - ストリーミング: `serializer.errors` の**辞書そのもの**を message に入れて 400 を返す。
 * どちらも実 DRF の出力を採取して一致を確認している（test/chat-request.test.ts）。
 */
export type ChatMode = "qa" | "study";

export type ValidatedChatRequest = {
  messages: { role: string; content: string }[];
  groupId: number | null;
  mode: ChatMode;
  studySessionId: string | null;
};

/** ErrorDetail(string=..., code=...) 1 件。 */
type Detail = { message: string; code: string };

/** serializer.errors の値。宣言順を保つため配列で持つ。 */
type ErrorValue =
  | { kind: "list"; details: Detail[] } // {"key": ["msg"]}
  | { kind: "nonField"; details: Detail[] } // {"key": {"non_field_errors": ["msg"]}}
  | { kind: "items"; items: Array<Array<[string, Detail[]]>> }; // {"key": [{...}, {}]}

type Errors = Array<[string, ErrorValue]>;

export type ChatRequestResult =
  | { ok: true; value: ValidatedChatRequest }
  | { ok: false; errors: Errors };

const MESSAGE_ROLES = ["user", "assistant", "system"];
const MODES = ["qa", "study"];

const detail = (message: string, code: string): Detail => ({ message, code });

// ---------------------------------------------------------------------------
// Python の型名 / str() / repr() 再現（エラーメッセージに現れる範囲）
// ---------------------------------------------------------------------------
function pyTypeName(v: unknown): string {
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (Array.isArray(v)) return "list";
  return "dict";
}

/** Python の repr（str 用）。' を含み " を含まない場合のみ二重引用符になる。 */
function pyRepr(s: string): string {
  const escaped = s.replace(/\\/g, "\\\\");
  if (escaped.includes("'") && !escaped.includes('"')) return `"${escaped}"`;
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

/** Python の str()。ChoiceField の invalid_choice メッセージで使う。 */
function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (Array.isArray(v)) return `[${v.map(pyReprValue).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${pyRepr(k)}: ${pyReprValue(val)}`)
    .join(", ")}}`;
}

function pyReprValue(v: unknown): string {
  if (typeof v === "string") return pyRepr(v);
  return pyStr(v);
}

/** ネストした item エラーの Python 辞書 repr（非ストリーミングの message/fields に出る形）。 */
function itemRepr(item: Array<[string, Detail[]]>): string {
  if (item.length === 0) return "{}";
  const entries = item.map(
    ([key, details]) =>
      `${pyRepr(key)}: [${details
        .map((d) => `ErrorDetail(string=${pyRepr(d.message)}, code=${pyRepr(d.code)})`)
        .join(", ")}]`,
  );
  return `{${entries.join(", ")}}`;
}

// ---------------------------------------------------------------------------
// フィールド単位のバリデーション
// ---------------------------------------------------------------------------
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** ChoiceField.to_internal_value 相当。 */
function choiceField(
  body: Record<string, unknown>,
  key: string,
  choices: string[],
): { kind: "absent" } | { kind: "value"; value: string } | { kind: "error"; detail: Detail } {
  if (!(key in body)) return { kind: "absent" };
  const data = body[key];
  if (data === null)
    return { kind: "error", detail: detail("This field may not be null.", "null") };
  const asStr = pyStr(data);
  if (!choices.includes(asStr))
    return {
      kind: "error",
      detail: detail(`"${asStr}" is not a valid choice.`, "invalid_choice"),
    };
  return { kind: "value", value: asStr };
}

/** CharField（required / allow_blank / allow_null / trim_whitespace / max_length）。 */
function charFieldDetail(
  body: Record<string, unknown>,
  key: string,
  opts: {
    required?: boolean;
    allowBlank?: boolean;
    allowNull?: boolean;
    maxLength?: number;
  },
):
  | { kind: "absent" }
  | { kind: "value"; value: string | null }
  | { kind: "error"; detail: Detail } {
  const { required = true, allowBlank = false, allowNull = false, maxLength } = opts;
  if (!(key in body)) {
    if (required) return { kind: "error", detail: detail("This field is required.", "required") };
    return { kind: "absent" };
  }
  const data = body[key];

  if (data === "" || (typeof data === "string" && data.trim() === "")) {
    if (!allowBlank)
      return { kind: "error", detail: detail("This field may not be blank.", "blank") };
    return { kind: "value", value: "" };
  }
  if (data === null) {
    if (!allowNull)
      return { kind: "error", detail: detail("This field may not be null.", "null") };
    return { kind: "value", value: null };
  }
  if (typeof data === "boolean" || !(typeof data === "string" || typeof data === "number")) {
    return { kind: "error", detail: detail("Not a valid string.", "invalid") };
  }
  const value = String(data).trim();
  if (maxLength !== undefined && [...value].length > maxLength) {
    return {
      kind: "error",
      detail: detail(
        `Ensure this field has no more than ${maxLength} characters.`,
        "max_length",
      ),
    };
  }
  return { kind: "value", value };
}

function validateMessageItem(
  item: unknown,
): { ok: true; value: { role: string; content: string } } | { ok: false; errors: Array<[string, Detail[]]> } {
  if (!isPlainObject(item)) {
    return {
      ok: false,
      errors: [
        [
          "non_field_errors",
          [
            detail(
              `Invalid data. Expected a dictionary, but got ${pyTypeName(item)}.`,
              "invalid",
            ),
          ],
        ],
      ],
    };
  }

  const errors: Array<[string, Detail[]]> = [];

  // role: ChoiceField(required=True)
  let role = "";
  if (!("role" in item)) {
    errors.push(["role", [detail("This field is required.", "required")]]);
  } else {
    const r = choiceField(item, "role", MESSAGE_ROLES);
    if (r.kind === "error") errors.push(["role", [r.detail]]);
    else if (r.kind === "value") role = r.value;
  }

  // content: CharField(required=True)
  let content = "";
  const cr = charFieldDetail(item, "content", {});
  if (cr.kind === "error") errors.push(["content", [cr.detail]]);
  else if (cr.kind === "value") content = cr.value ?? "";

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { role, content } };
}

/** ChatRequestSerializer 全体。宣言順（messages → group_id → mode → study_session_id）。 */
export function validateChatRequest(body: unknown): ChatRequestResult {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: [
        [
          "non_field_errors",
          {
            kind: "list",
            details: [
              detail(
                `Invalid data. Expected a dictionary, but got ${pyTypeName(body)}.`,
                "invalid",
              ),
            ],
          },
        ],
      ],
    };
  }

  const errors: Errors = [];
  let messages: { role: string; content: string }[] = [];

  if (!("messages" in body)) {
    errors.push([
      "messages",
      { kind: "list", details: [detail("This field is required.", "required")] },
    ]);
  } else if (body.messages === null) {
    errors.push([
      "messages",
      { kind: "list", details: [detail("This field may not be null.", "null")] },
    ]);
  } else if (!Array.isArray(body.messages)) {
    errors.push([
      "messages",
      {
        kind: "nonField",
        details: [
          detail(
            `Expected a list of items but got type "${pyTypeName(body.messages)}".`,
            "not_a_list",
          ),
        ],
      },
    ]);
  } else {
    const items: Array<Array<[string, Detail[]]>> = [];
    const values: { role: string; content: string }[] = [];
    let anyError = false;
    for (const raw of body.messages) {
      const r = validateMessageItem(raw);
      if (r.ok) {
        items.push([]);
        values.push(r.value);
      } else {
        anyError = true;
        items.push(r.errors);
      }
    }
    if (anyError) errors.push(["messages", { kind: "items", items }]);
    else messages = values;
  }

  // group_id: IntegerField(required=False, allow_null=True)
  let groupId: number | null = null;
  if ("group_id" in body && body.group_id !== null) {
    const v = body.group_id;
    let n: number | null = null;
    if (typeof v === "number" && Number.isInteger(v)) n = v;
    else if (typeof v === "string" && /^\s*-?\d+\s*$/.test(v)) n = parseInt(v.trim(), 10);
    if (n === null) {
      errors.push([
        "group_id",
        { kind: "list", details: [detail("A valid integer is required.", "invalid")] },
      ]);
    } else {
      groupId = n;
    }
  }

  // mode: ChoiceField(required=False, default="qa")
  let mode: ChatMode = "qa";
  const m = choiceField(body, "mode", MODES);
  if (m.kind === "error") errors.push(["mode", { kind: "list", details: [m.detail] }]);
  else if (m.kind === "value") mode = m.value as ChatMode;

  // study_session_id: CharField(required=False, allow_null=True, allow_blank=True, max_length=128)
  let studySessionId: string | null = null;
  const s = charFieldDetail(body, "study_session_id", {
    required: false,
    allowBlank: true,
    allowNull: true,
    maxLength: 128,
  });
  if (s.kind === "error")
    errors.push(["study_session_id", { kind: "list", details: [s.detail] }]);
  else if (s.kind === "value") studySessionId = s.value;

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { messages, groupId, mode, studySessionId: studySessionId || null },
  };
}

// ---------------------------------------------------------------------------
// OpenAI 互換エンドポイント（OpenAIChatRequestSerializer）
// ---------------------------------------------------------------------------

export type ValidatedOpenAiChatRequest = {
  model: string;
  messages: { role: string; content: string }[];
  groupId: number | null;
  language: string | null;
};

export type OpenAiChatRequestResult =
  | { ok: true; value: ValidatedOpenAiChatRequest }
  | { ok: false; errors: Errors };

/** FloatField.to_internal_value（`float(data)`）。bool も通る点が IntegerField と違う。 */
function floatField(
  body: Record<string, unknown>,
  key: string,
): { kind: "absent" } | { kind: "value" } | { kind: "error"; detail: Detail } {
  if (!(key in body)) return { kind: "absent" };
  const data = body[key];
  if (data === null)
    return { kind: "error", detail: detail("This field may not be null.", "null") };
  if (typeof data === "number" || typeof data === "boolean") return { kind: "value" };
  if (typeof data === "string" && data.trim() !== "" && Number.isFinite(Number(data)))
    return { kind: "value" };
  return { kind: "error", detail: detail("A valid number is required.", "invalid") };
}

/** IntegerField.to_internal_value（`int(re_decimal.sub("", str(data)))`）。 */
function integerFieldDetail(
  body: Record<string, unknown>,
  key: string,
): { kind: "absent" } | { kind: "value"; value: number } | { kind: "error"; detail: Detail } {
  if (!(key in body)) return { kind: "absent" };
  const data = body[key];
  if (data === null)
    return { kind: "error", detail: detail("This field may not be null.", "null") };
  const invalid = {
    kind: "error" as const,
    detail: detail("A valid integer is required.", "invalid"),
  };
  if (typeof data === "boolean") return invalid;
  if (typeof data === "number")
    return Number.isInteger(data) ? { kind: "value", value: data } : invalid;
  if (typeof data === "string") {
    // re_decimal は末尾の ".0" だけを落とす（"1.0" → 1、"1.5" は不正）。
    const trimmed = data.trim().replace(/\.0+$/, "");
    if (/^-?\d+$/.test(trimmed)) return { kind: "value", value: parseInt(trimmed, 10) };
  }
  return invalid;
}

const BOOLEAN_LITERALS = new Set([
  "t", "T", "y", "Y", "yes", "Yes", "YES", "true", "True", "TRUE", "on", "On", "ON", "1",
  "f", "F", "n", "N", "no", "No", "NO", "false", "False", "FALSE", "off", "Off", "OFF", "0",
]);

/** BooleanField.to_internal_value。 */
function booleanField(
  body: Record<string, unknown>,
  key: string,
): { kind: "absent" } | { kind: "value" } | { kind: "error"; detail: Detail } {
  if (!(key in body)) return { kind: "absent" };
  const data = body[key];
  if (data === null)
    return { kind: "error", detail: detail("This field may not be null.", "null") };
  if (typeof data === "boolean") return { kind: "value" };
  if (typeof data === "number" && (data === 0 || data === 1)) return { kind: "value" };
  if (typeof data === "string" && BOOLEAN_LITERALS.has(data)) return { kind: "value" };
  return { kind: "error", detail: detail("Must be a valid boolean.", "invalid") };
}

/**
 * `OpenAIChatRequestSerializer` 全体。宣言順は
 * model → messages → group_id → temperature → max_tokens → top_p → stream → language。
 * temperature/max_tokens/top_p/stream は view が無視するが、検証は DRF と同じく行う。
 */
export function validateOpenAiChatRequest(body: unknown): OpenAiChatRequestResult {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: [
        [
          "non_field_errors",
          {
            kind: "list",
            details: [
              detail(
                `Invalid data. Expected a dictionary, but got ${pyTypeName(body)}.`,
                "invalid",
              ),
            ],
          },
        ],
      ],
    };
  }

  const errors: Errors = [];
  const push = (key: string, d: Detail) =>
    errors.push([key, { kind: "list", details: [d] }]);

  // model: CharField(default="videoq")
  let model = "videoq";
  const modelField = charFieldDetail(body, "model", { required: false });
  if (modelField.kind === "error") push("model", modelField.detail);
  else if (modelField.kind === "value") model = modelField.value ?? "videoq";

  // messages: MessageSerializer(many=True)
  let messages: { role: string; content: string }[] = [];
  if (!("messages" in body)) {
    push("messages", detail("This field is required.", "required"));
  } else if (body.messages === null) {
    push("messages", detail("This field may not be null.", "null"));
  } else if (!Array.isArray(body.messages)) {
    errors.push([
      "messages",
      {
        kind: "nonField",
        details: [
          detail(
            `Expected a list of items but got type "${pyTypeName(body.messages)}".`,
            "not_a_list",
          ),
        ],
      },
    ]);
  } else {
    const items: Array<Array<[string, Detail[]]>> = [];
    const values: { role: string; content: string }[] = [];
    let anyError = false;
    for (const raw of body.messages) {
      const r = validateMessageItem(raw);
      if (r.ok) {
        items.push([]);
        values.push(r.value);
      } else {
        anyError = true;
        items.push(r.errors);
      }
    }
    if (anyError) errors.push(["messages", { kind: "items", items }]);
    else messages = values;
  }

  // group_id: IntegerField(required=False, allow_null=True)
  let groupId: number | null = null;
  if ("group_id" in body && body.group_id !== null) {
    const g = integerFieldDetail(body, "group_id");
    if (g.kind === "error") push("group_id", g.detail);
    else if (g.kind === "value") groupId = g.value;
  }

  for (const key of ["temperature", "top_p"] as const) {
    const f = floatField(body, key);
    if (f.kind === "error") push(key, f.detail);
  }
  if ("max_tokens" in body) {
    const t = integerFieldDetail(body, "max_tokens");
    if (t.kind === "error") push("max_tokens", t.detail);
  }
  const s = booleanField(body, "stream");
  if (s.kind === "error") push("stream", s.detail);

  // language: CharField(required=False, allow_null=True)
  let language: string | null = null;
  const lang = charFieldDetail(body, "language", { required: false, allowNull: true });
  if (lang.kind === "error") push("language", lang.detail);
  else if (lang.kind === "value") language = lang.value;

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { model, messages, groupId, language } };
}

/** `serializer.errors` 相当の素の JSON（ストリーミング版の message にそのまま入る）。 */
export function serializerErrors(errors: Errors): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of errors) {
    if (value.kind === "list") out[key] = value.details.map((d) => d.message);
    else if (value.kind === "nonField")
      out[key] = { non_field_errors: value.details.map((d) => d.message) };
    else
      out[key] = value.items.map((item) =>
        Object.fromEntries(item.map(([k, ds]) => [k, ds.map((d) => d.message)])),
      );
  }
  return out;
}

/**
 * custom_exception_handler の平坦化（_get_error_message / _get_field_errors）。
 * - message: detail → non_field_errors → 先頭の list 値の先頭要素（dict 値は無視）。
 *   list の要素がネスト dict なら Python の str() 表現になる。
 * - fields: list/str の値のみ（non_field_errors と detail は除外）。
 */
export function flattenErrors(errors: Errors): {
  message: string;
  fields: Record<string, string[]> | null;
} {
  const stringsFor = (value: ErrorValue): string[] | null => {
    if (value.kind === "list") return value.details.map((d) => d.message);
    if (value.kind === "items") return value.items.map(itemRepr);
    return null; // nonField は dict 値なので message/fields の対象外
  };

  let message: string | null = null;
  const nonField = errors.find(([k]) => k === "non_field_errors");
  if (nonField) {
    const s = stringsFor(nonField[1]);
    if (s && s.length > 0) message = s[0];
  }
  if (message === null) {
    for (const [, value] of errors) {
      const s = stringsFor(value);
      if (s && s.length > 0) {
        message = s[0];
        break;
      }
    }
  }

  const fields: Record<string, string[]> = {};
  for (const [key, value] of errors) {
    if (key === "non_field_errors" || key === "detail") continue;
    const s = stringsFor(value);
    if (s) fields[key] = s;
  }

  return {
    message: message ?? "Bad Request",
    fields: Object.keys(fields).length > 0 ? fields : null,
  };
}
