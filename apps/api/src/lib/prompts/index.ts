import promptConfig from "./prompts.json";

/**
 * VideoQ の RAG / PLOG プロンプトを `prompts.json` から構築する。
 * ロケール解決は default をベースに locale を deep merge する。
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
  agent?: { instructions?: unknown; role?: unknown; background?: unknown; rules?: unknown };
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

/** default に locale の上書きを 1 段だけ deep merge する。 */
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

/** RAG / plog_study の名前付きプレースホルダを置換する。 */
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

/** locale に対応する PLOG Study 設定を返す。 */
export function getPlogStudyConfig(locale?: string | null): Record<string, unknown> {
  return resolveLocaleSection("plog_study", locale);
}

/**
 * 解決済みのロケール設定から開始質問を返す。
 * 空 / 既知の英語フォールバックテンプレだけ locale 向けに差し替える。
 */
export function resolveOpeningQuestion(
  label: string,
  opening: string | null | undefined,
  config: Readonly<Record<string, unknown>>,
): string {
  const text = (opening || "").trim();
  const defaultTemplate = promptConfig.plog_study.default.opening_question;
  if (text && text !== formatTemplate(defaultTemplate, { label })) return text;
  return formatTemplate(String(config.opening_question || defaultTemplate), { label });
}

/**
 * header / rules / format までの共通部分を組み立てる。
 * 末尾（参照なしの案内 or 検索の指示）だけが呼び出し側で変わる。
 */
function buildPromptBase(
  config: LocaleSection,
  /** header テンプレート内の {reference_label} に差し込む末尾セクション名。 */
  referenceLabel: string,
): string[] {
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

  const rulesLabel = sectionTitles.rules ?? "# Rules";
  const formatLabel = sectionTitles.format ?? "# Format";

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

  lines.push("", rulesLabel);
  if (rules.length > 0) {
    rules.forEach((rule, i) => lines.push(`${i + 1}. ${rule}`));
  } else {
    lines.push("1. Follow common-sense safety best practices.");
  }

  lines.push("", formatLabel, formatInstruction.trim());

  return lines;
}

/** 講座未指定の Q&A 用。参照シーンがないことを明示する。 */
export function buildNoCourseSystemPrompt(locale?: string | null): string {
  const config = resolveLocaleSection("rag", locale) as LocaleSection;
  const referenceLabel = config.section_titles?.reference ?? "# Reference Materials";
  const lines = buildPromptBase(config, referenceLabel);

  lines.push("", referenceLabel);
  if (config.reference?.empty) lines.push(config.reference.empty);

  return lines.join("\n");
}

/**
 * ReAct エージェント用の system prompt。
 * 参照シーンは実行前には決まらないので、代わりに検索ツールの使い方を指示する。
 */
export function buildAgentSystemPrompt(
  locale: string | null | undefined,
  maxSearches: number,
  maxCourseInfoCalls: number,
): string {
  const config = resolveLocaleSection("rag", locale) as LocaleSection;
  const searchLabel = config.section_titles?.search ?? "# Scene Search";
  const lines = buildPromptBase({ ...config, ...config.agent }, searchLabel);

  const instructions = config.agent?.instructions;
  if (!Array.isArray(instructions) || instructions.some((i) => typeof i !== "string")) {
    throw new Error("Prompt agent.instructions must be a list of strings.");
  }

  lines.push("", searchLabel);
  lines.push(
    ...(instructions as string[]).map((instruction) =>
      formatTemplate(instruction, {
        max_searches: String(maxSearches),
        max_course_info_calls: String(maxCourseInfoCalls),
      }),
    ),
  );

  return lines.join("\n");
}
