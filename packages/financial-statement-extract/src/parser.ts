import type { ExtractionResult, ExtractionLine } from "@valuation-bot/contract";

export type ParseError =
  | { kind: "json_parse_error"; message: string; raw: string }
  | { kind: "validation_error"; message: string; path: string };

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseError };

const PERIOD_TYPES = new Set<string>(["FY", "HY", "Q1", "Q2", "Q3", "Q4"]);

// Strip markdown code fences the model may accidentally emit despite instructions
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function validationErr(path: string, message: string): { ok: false; error: ParseError } {
  return { ok: false, error: { kind: "validation_error", message, path } };
}

function parseStr(v: unknown, path: string): ParseResult<string> {
  if (typeof v === "string") return { ok: true, value: v };
  return validationErr(path, `expected string, got ${typeof v}`);
}

function parseStrNullable(v: unknown, path: string): ParseResult<string | null> {
  if (v === null || typeof v === "string") return { ok: true, value: v as string | null };
  return validationErr(path, `expected string or null, got ${typeof v}`);
}

function parseNum(v: unknown, path: string): ParseResult<number> {
  if (typeof v === "number" && !Number.isNaN(v)) return { ok: true, value: v };
  return validationErr(path, `expected number, got ${typeof v}`);
}

function parseNumNullable(v: unknown, path: string): ParseResult<number | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v === "number" && !Number.isNaN(v)) return { ok: true, value: v };
  return validationErr(path, `expected number or null, got ${typeof v}`);
}

function parseBool(v: unknown, path: string): ParseResult<boolean> {
  if (typeof v === "boolean") return { ok: true, value: v };
  return validationErr(path, `expected boolean, got ${typeof v}`);
}

function parseExtractionLine(v: unknown, path: string): ParseResult<ExtractionLine> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return validationErr(path, "expected object");
  }
  const obj = v as Record<string, unknown>;

  const tag = parseStrNullable(obj["tag"], `${path}.tag`);
  if (!tag.ok) return tag;
  const label = parseStr(obj["label"], `${path}.label`);
  if (!label.ok) return label;
  const value = parseNumNullable(obj["value"], `${path}.value`);
  if (!value.ok) return value;
  const valueComp = parseNumNullable(obj["value_comparative"], `${path}.value_comparative`);
  if (!valueComp.ok) return valueComp;

  return {
    ok: true,
    value: {
      tag: tag.value,
      label: label.value,
      value: value.value,
      value_comparative: valueComp.value,
    },
  };
}

function parseLineArray(v: unknown, path: string): ParseResult<ExtractionLine[]> {
  if (!Array.isArray(v)) return validationErr(path, "expected array");
  const lines: ExtractionLine[] = [];
  for (let i = 0; i < v.length; i++) {
    const result = parseExtractionLine(v[i], `${path}[${i}]`);
    if (!result.ok) return result;
    lines.push(result.value);
  }
  return { ok: true, value: lines };
}

export function parse(raw: string): ParseResult<ExtractionResult> {
  const cleaned = stripFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "json_parse_error",
        message: e instanceof Error ? e.message : String(e),
        raw: cleaned,
      },
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return validationErr("", "expected JSON object at root");
  }
  const obj = parsed as Record<string, unknown>;

  const company_name = parseStr(obj["company_name"], "company_name");
  if (!company_name.ok) return company_name;

  const counter_code = parseStrNullable(obj["counter_code"], "counter_code");
  if (!counter_code.ok) return counter_code;

  const currency = parseStr(obj["currency"], "currency");
  if (!currency.ok) return currency;

  const unit_multiplier = parseNum(obj["unit_multiplier"], "unit_multiplier");
  if (!unit_multiplier.ok) return unit_multiplier;

  const period_end = parseStr(obj["period_end"], "period_end");
  if (!period_end.ok) return period_end;

  const comparative_period_end = parseStrNullable(obj["comparative_period_end"], "comparative_period_end");
  if (!comparative_period_end.ok) return comparative_period_end;

  const period_type_str = parseStr(obj["period_type"], "period_type");
  if (!period_type_str.ok) return period_type_str;
  if (!PERIOD_TYPES.has(period_type_str.value)) {
    return validationErr("period_type", `invalid value: "${period_type_str.value}"`);
  }

  const consolidated = parseBool(obj["consolidated"], "consolidated");
  if (!consolidated.ok) return consolidated;

  const audited = parseBool(obj["audited"], "audited");
  if (!audited.ok) return audited;

  if (typeof obj["statements"] !== "object" || obj["statements"] === null || Array.isArray(obj["statements"])) {
    return validationErr("statements", "expected object");
  }
  const stmts = obj["statements"] as Record<string, unknown>;

  const income_statement = parseLineArray(stmts["income_statement"], "statements.income_statement");
  if (!income_statement.ok) return income_statement;

  const balance_sheet = parseLineArray(stmts["balance_sheet"], "statements.balance_sheet");
  if (!balance_sheet.ok) return balance_sheet;

  const cash_flow = parseLineArray(stmts["cash_flow"], "statements.cash_flow");
  if (!cash_flow.ok) return cash_flow;

  if (!Array.isArray(obj["extraction_warnings"])) {
    return validationErr("extraction_warnings", "expected array");
  }
  const extraction_warnings: string[] = [];
  for (let i = 0; i < obj["extraction_warnings"].length; i++) {
    const w = parseStr(obj["extraction_warnings"][i], `extraction_warnings[${i}]`);
    if (!w.ok) return w;
    extraction_warnings.push(w.value);
  }

  return {
    ok: true,
    value: {
      company_name: company_name.value,
      counter_code: counter_code.value,
      currency: currency.value,
      unit_multiplier: unit_multiplier.value,
      period_end: period_end.value,
      comparative_period_end: comparative_period_end.value,
      period_type: period_type_str.value as ExtractionResult["period_type"],
      consolidated: consolidated.value,
      audited: audited.value,
      statements: {
        income_statement: income_statement.value,
        balance_sheet: balance_sheet.value,
        cash_flow: cash_flow.value,
      },
      extraction_warnings,
    },
  };
}
