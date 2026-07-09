import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtractionResult } from "@valuation-bot/contract";
import { parse, type ParseResult } from "./parser";

/** Request handed to a provider-specific completion function. */
export interface LlmCompletionRequest {
  /** System prompt — normally the contents of EXTRACTION_PROMPT.md. */
  systemPrompt: string;
  /** User message: the concatenated text of the selected statement pages. */
  userMessage: string;
  /** Sampling temperature; always 0 for extraction calls. */
  temperature: number;
  /** Whether to request the provider's JSON mode / structured output, where supported. */
  jsonMode: boolean;
}

/**
 * Provider-specific function that performs one LLM completion call and
 * returns the raw text of the model's response. Implementations translate
 * `LlmCompletionRequest` into the target provider's request shape (OpenAI,
 * Anthropic, etc.) — this module never talks to a provider directly, which
 * is what makes `extract` provider-agnostic.
 */
export type LlmComplete = (request: LlmCompletionRequest) => Promise<string>;

export interface ExtractInput {
  /** Page texts already narrowed to statement pages (see pageFinder.ts). */
  pageTexts: readonly string[];
  /** System prompt text; defaults to `readExtractionPrompt()`. */
  systemPrompt?: string;
  /** Provider adapter that performs the actual completion call. */
  complete: LlmComplete;
}

/**
 * Extracts the system prompt block from EXTRACTION_PROMPT.md — the fenced
 * code block that follows the given heading — so callers get exactly the
 * prompt text, not the surrounding documentation.
 */
function extractFencedBlock(markdown: string, afterHeading: string): string {
  const headingIndex = markdown.indexOf(afterHeading);
  if (headingIndex === -1) {
    throw new RangeError(`heading "${afterHeading}" not found in prompt markdown`);
  }
  const fenceStart = markdown.indexOf("```", headingIndex);
  if (fenceStart === -1) {
    throw new RangeError("no fenced code block found after heading");
  }
  const contentStart = markdown.indexOf("\n", fenceStart) + 1;
  const fenceEnd = markdown.indexOf("```", contentStart);
  if (fenceEnd === -1) {
    throw new RangeError("unterminated fenced code block");
  }
  return markdown.slice(contentStart, fenceEnd).trim();
}

/**
 * Reads the extraction system prompt out of EXTRACTION_PROMPT.md, which
 * sits one directory above this module. Pass `promptPath` to read from a
 * different location (e.g. in tests).
 */
export function readExtractionPrompt(
  promptPath: string = join(__dirname, "..", "EXTRACTION_PROMPT.md"),
): string {
  const markdown = readFileSync(promptPath, "utf-8");
  return extractFencedBlock(markdown, "## System prompt");
}

/**
 * Sends the narrowed statement pages to an LLM at temperature 0, requesting
 * JSON mode where the provider supports it, then pipes the raw response
 * through parser.ts's `parse` to produce a validated `ExtractionResult` (or
 * a parse/validation error).
 *
 * Throws RangeError if `pageTexts` is empty or the resolved `systemPrompt`
 * is blank.
 */
export async function extract(input: ExtractInput): Promise<ParseResult<ExtractionResult>> {
  if (input.pageTexts.length === 0) {
    throw new RangeError("pageTexts must contain at least one page");
  }
  const systemPrompt = input.systemPrompt ?? readExtractionPrompt();
  if (systemPrompt.trim().length === 0) {
    throw new RangeError("systemPrompt must be a non-empty string");
  }

  const raw = await input.complete({
    systemPrompt,
    userMessage: input.pageTexts.join("\n\n---\n\n"),
    temperature: 0,
    jsonMode: true,
  });

  return parse(raw);
}
