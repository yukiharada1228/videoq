import { z } from "zod";

/** Zod 4: `z.record` requires key + value schemas. */
export const zStringRecord = <V extends z.ZodType>(value: V) =>
  z.record(z.string(), value);

/** Zod 4: replace Zod 3 `required_error` / `invalid_type_error`. */
export function zReqString(
  required = "This field is required.",
  invalid = "Not a valid string.",
) {
  return z.string({
    error: (issue) => (issue.input === undefined ? required : invalid),
  });
}

export function zReqNumber(
  required = "This field is required.",
  invalid = "A valid integer is required.",
) {
  return z.coerce.number({
    error: (issue) => (issue.input === undefined ? required : invalid),
  });
}

export function zReqArray<T extends z.ZodType>(item: T, message: string) {
  return z.array(item, { error: message });
}
