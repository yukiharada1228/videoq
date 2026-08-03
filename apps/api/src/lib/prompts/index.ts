import promptConfig from "./prompts.json";

/**
 * Django `app/infrastructure/external/prompts/loader.py` の `build_system_prompt` 移植。
 * `prompts.json` は Django 側と**同一ファイルをコピー**して使う（差分は禁止・更新時は両方）。
 *
 * ロケール解決は Django と同じ「default をベースに locale を deep merge」。
 * 候補は `locale` → `locale` のハイフン前 → default の順で、最初に見つかった 1 つだけを merge する。
 */
const DEFAULT_LOCALE = "default";

type LocaleSection = {
  header?: unknown;
  role?: unknown;
  background?: unknown;
  request?: unknown;
  format_instruction?: unknown;
  rules?: unknown;
  section_titles?: Record<string, string>;
  reference?: Record<string, string>;
};

type PromptRoot = Record<string, Record<string, LocaleSection>>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
}

function localeCandidates(locale: string | null | undefined): string[] {
  const out: string[] = [];
  if (locale) {
    out.push(locale);
    if (locale.includes("-")) out.push(locale.split("-", 1)[0]);
  }
  return out;
}

/** resolve_locale_section 相当。default に locale の上書きを 1 段だけ deep merge する。 */
export function resolveLocaleSection(
  rootKey: string,
  locale?: string | null,
): Record<string, unknown> {
  const configRoot = (promptConfig as unknown as PromptRoot)[rootKey] ?? {};
  const defaultConfig = configRoot[DEFAULT_LOCALE];
  if (!isPlainObject(defaultConfig)) {
    throw new Error(`Prompt configuration missing 'default' locale for key '${rootKey}'.`);
  }

  let resolved = structuredClone(defaultConfig) as Record<string, unknown>;
  for (const candidate of localeCandidates(locale)) {
    if (candidate === DEFAULT_LOCALE) continue;
    const localeConfig = configRoot[candidate];
    if (isPlainObject(localeConfig)) {
      resolved = deepMerge(resolved, localeConfig as Record<string, unknown>);
      break;
    }
  }
  return resolved;
}

/** Python str.format の名前付きプレースホルダのみを置換する（RAG / plog_study で使う範囲）。 */
export function formatTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key]! : whole,
  );
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Prompt configuration lacks required header fields (${field}).`);
  }
  return value;
}

function referenceLines(
  reference: Record<string, string>,
  references: readonly string[] | undefined,
): string[] {
  const lines: string[] = [];
  const lead = reference.lead ?? "";
  const footer = reference.footer ?? "";
  const empty = reference.empty ?? "";

  const texts = (references ?? []).map(String).filter((t) => t.trim() !== "");
  if (texts.length > 0) {
    if (lead) lines.push(lead);
    lines.push(...texts);
    if (footer) lines.push(footer);
  } else if (empty) {
    lines.push(empty);
  }
  return lines;
}

/** get_plog_study_config(locale) 相当。 */
export function getPlogStudyConfig(locale?: string | null): Record<string, unknown> {
  return resolveLocaleSection("plog_study", locale);
}

/** build_fallback_learning_object の opening_question のみ。 */
export function buildFallbackOpening(label: string, locale?: string | null): string {
  const config = getPlogStudyConfig(locale);
  const template = String(
    config.opening_question || "What do you already know about {label}?",
  );
  return formatTemplate(template, { label });
}

/**
 * resolve_opening_question 相当。
 * 空 / 既知の英語フォールバックテンプレだけ locale 向けに差し替える。
 */
export function resolveOpeningQuestion(
  label: string,
  opening: string | null | undefined,
  locale?: string | null,
): string {
  const preferred = buildFallbackOpening(label, locale);
  const text = (opening || "").trim();
  if (!text) return preferred;
  const enDefault = buildFallbackOpening(label, DEFAULT_LOCALE);
  if (text === enDefault) return preferred;
  return text;
}

/** build_system_prompt(locale, references, group_context) 相当。 */
export function buildSystemPrompt(
  locale?: string | null,
  references?: readonly string[],
  groupContext?: string | null,
): string {
  const config = resolveLocaleSection("rag", locale) as LocaleSection;

  const headerTemplate = requireText(config.header, "header");
  const role = requireText(config.role, "role");
  const background = requireText(config.background, "background");
  const request = requireText(config.request, "request");
  const formatInstruction = requireText(config.format_instruction, "format_instruction");
  const rules = config.rules ?? [];
  if (!Array.isArray(rules) || rules.some((r) => typeof r !== "string")) {
    throw new Error("Prompt rules must be a list of strings.");
  }
  const sectionTitles = config.section_titles ?? {};
  const reference = config.reference ?? {};

  const rulesLabel = sectionTitles.rules ?? "# Rules";
  const formatLabel = sectionTitles.format ?? "# Format";
  const referenceLabel = sectionTitles.reference ?? "# Reference Materials";
  const groupContextLabel = sectionTitles.group_context ?? "# Group Context";

  const header = formatTemplate(headerTemplate, {
    role,
    background,
    request,
    format_instruction: formatInstruction,
    rules_label: rulesLabel,
    format_label: formatLabel,
    reference_label: referenceLabel,
  });

  const lines: string[] = [header.trim()];

  if (groupContext && groupContext.trim())
    lines.push("", groupContextLabel, groupContext.trim());

  lines.push("", rulesLabel);
  if (rules.length > 0) {
    rules.forEach((rule, i) => lines.push(`${i + 1}. ${rule}`));
  } else {
    lines.push("1. Follow common-sense safety best practices.");
  }

  lines.push("", formatLabel, formatInstruction.trim(), "", referenceLabel);
  lines.push(...referenceLines(reference, references));

  return lines.join("\n");
}
