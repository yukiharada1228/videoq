import { describe, it, expect } from "vitest";
import {
  validateChatRequest,
  serializerErrors,
  flattenErrors,
} from "../src/utils/chat-request";

/**
 * 実 DRF（`ChatRequestSerializer` + `custom_exception_handler`）から採取した固定ベクトル。
 *   stream = StreamChatView が message に入れる serializer.errors の辞書
 *   msg / fields = 非ストリーミング（raise_exception=True）の平坦化結果
 */
type Expected = {
  stream: Record<string, unknown>;
  msg: string;
  fields: Record<string, string[]> | null;
};

const check = (body: unknown, expected: Expected) => {
  const r = validateChatRequest(body);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(serializerErrors(r.errors)).toEqual(expected.stream);
  const flat = flattenErrors(r.errors);
  expect(flat.message).toBe(expected.msg);
  expect(flat.fields).toEqual(expected.fields);
};

describe("ChatRequestSerializer（DRF 出力と一致）", () => {
  it("messages 欠落", () => {
    check(
      {},
      {
        stream: { messages: ["This field is required."] },
        msg: "This field is required.",
        fields: { messages: ["This field is required."] },
      },
    );
  });

  it("messages が null", () => {
    check(
      { messages: null },
      {
        stream: { messages: ["This field may not be null."] },
        msg: "This field may not be null.",
        fields: { messages: ["This field may not be null."] },
      },
    );
  });

  it("messages が配列でない → non_field_errors（message/fields からは除外される）", () => {
    check(
      { messages: "x" },
      {
        stream: {
          messages: { non_field_errors: ['Expected a list of items but got type "str".'] },
        },
        msg: "Bad Request",
        fields: null,
      },
    );
  });

  it("role が選択肢外 → ネスト dict は Python repr 文字列になる", () => {
    check(
      { messages: [{ role: "bad", content: "hi" }] },
      {
        stream: { messages: [{ role: ['"bad" is not a valid choice.'] }] },
        msg: "{'role': [ErrorDetail(string='\"bad\" is not a valid choice.', code='invalid_choice')]}",
        fields: {
          messages: [
            "{'role': [ErrorDetail(string='\"bad\" is not a valid choice.', code='invalid_choice')]}",
          ],
        },
      },
    );
  });

  it("content が空白のみ → blank", () => {
    check(
      { messages: [{ role: "user", content: "   " }] },
      {
        stream: { messages: [{ content: ["This field may not be blank."] }] },
        msg: "{'content': [ErrorDetail(string='This field may not be blank.', code='blank')]}",
        fields: {
          messages: [
            "{'content': [ErrorDetail(string='This field may not be blank.', code='blank')]}",
          ],
        },
      },
    );
  });

  it("item が空 dict → role と content の両方が required", () => {
    check(
      { messages: [{}] },
      {
        stream: {
          messages: [
            { role: ["This field is required."], content: ["This field is required."] },
          ],
        },
        msg:
          "{'role': [ErrorDetail(string='This field is required.', code='required')], " +
          "'content': [ErrorDetail(string='This field is required.', code='required')]}",
        fields: {
          messages: [
            "{'role': [ErrorDetail(string='This field is required.', code='required')], " +
              "'content': [ErrorDetail(string='This field is required.', code='required')]}",
          ],
        },
      },
    );
  });

  it("item が dict でない", () => {
    check(
      { messages: ["hi"] },
      {
        stream: {
          messages: [
            { non_field_errors: ["Invalid data. Expected a dictionary, but got str."] },
          ],
        },
        msg: "{'non_field_errors': [ErrorDetail(string='Invalid data. Expected a dictionary, but got str.', code='invalid')]}",
        fields: {
          messages: [
            "{'non_field_errors': [ErrorDetail(string='Invalid data. Expected a dictionary, but got str.', code='invalid')]}",
          ],
        },
      },
    );
  });

  it("2 件目だけ不正 → 正常な item は {} が入る", () => {
    check(
      {
        messages: [
          { role: "user", content: "ok" },
          { role: "x", content: "y" },
        ],
      },
      {
        stream: { messages: [{}, { role: ['"x" is not a valid choice.'] }] },
        msg: "{}",
        fields: {
          messages: [
            "{}",
            "{'role': [ErrorDetail(string='\"x\" is not a valid choice.', code='invalid_choice')]}",
          ],
        },
      },
    );
  });

  it("role に dict → str() 表現が引用符付きで入る", () => {
    check(
      { messages: [{ role: { a: 1 }, content: "hi" }] },
      {
        stream: { messages: [{ role: ["\"{'a': 1}\" is not a valid choice."] }] },
        msg: "{'role': [ErrorDetail(string='\"{\\'a\\': 1}\" is not a valid choice.', code='invalid_choice')]}",
        fields: {
          messages: [
            "{'role': [ErrorDetail(string='\"{\\'a\\': 1}\" is not a valid choice.', code='invalid_choice')]}",
          ],
        },
      },
    );
  });

  it("role/content が数値 → role は str() 化して選択肢判定", () => {
    check(
      { messages: [{ role: 5, content: 5 }] },
      {
        stream: { messages: [{ role: ['"5" is not a valid choice.'] }] },
        msg: "{'role': [ErrorDetail(string='\"5\" is not a valid choice.', code='invalid_choice')]}",
        fields: {
          messages: [
            "{'role': [ErrorDetail(string='\"5\" is not a valid choice.', code='invalid_choice')]}",
          ],
        },
      },
    );
  });

  it("複数フィールド不正 → message は最初の list 値（dict 値は飛ばす）", () => {
    check(
      { messages: "x", group_id: "z", mode: "q" },
      {
        stream: {
          messages: { non_field_errors: ['Expected a list of items but got type "str".'] },
          group_id: ["A valid integer is required."],
          mode: ['"q" is not a valid choice.'],
        },
        msg: "A valid integer is required.",
        fields: {
          group_id: ["A valid integer is required."],
          mode: ['"q" is not a valid choice.'],
        },
      },
    );
  });

  it("mode が null / study_session_id が長すぎる", () => {
    check(
      { messages: [{ role: "user", content: "hi" }], mode: null },
      {
        stream: { mode: ["This field may not be null."] },
        msg: "This field may not be null.",
        fields: { mode: ["This field may not be null."] },
      },
    );
    check(
      { messages: [{ role: "user", content: "hi" }], study_session_id: "x".repeat(129) },
      {
        stream: {
          study_session_id: ["Ensure this field has no more than 128 characters."],
        },
        msg: "Ensure this field has no more than 128 characters.",
        fields: {
          study_session_id: ["Ensure this field has no more than 128 characters."],
        },
      },
    );
  });

  it("body が dict でない", () => {
    check([1, 2], {
      stream: {
        non_field_errors: ["Invalid data. Expected a dictionary, but got list."],
      },
      msg: "Invalid data. Expected a dictionary, but got list.",
      fields: null,
    });
  });
});

describe("ChatRequestSerializer（正常系の正規化）", () => {
  it("既定値: mode=qa, group_id/study_session_id は null", () => {
    const r = validateChatRequest({ messages: [{ role: "user", content: "hi" }] });
    expect(r).toEqual({
      ok: true,
      value: {
        messages: [{ role: "user", content: "hi" }],
        groupId: null,
        mode: "qa",
        studySessionId: null,
      },
    });
  });

  it("group_id は数値文字列を受理し、content/study_session_id は strip される", () => {
    const r = validateChatRequest({
      messages: [{ role: "user", content: " hi " }],
      group_id: "7",
      mode: "study",
      study_session_id: " abc ",
    });
    expect(r.ok && r.value).toEqual({
      messages: [{ role: "user", content: "hi" }],
      groupId: 7,
      mode: "study",
      studySessionId: "abc",
    });
  });

  it("group_id: null と messages: [] は許容（後続の前提条件で弾く）", () => {
    const r = validateChatRequest({ messages: [], group_id: null });
    expect(r.ok && r.value.messages).toEqual([]);
    expect(r.ok && r.value.groupId).toBeNull();
  });
});
