import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ExtractionResult } from "@valuation-bot/contract";
import { tieOut, type TieOutViolation } from "./tieOut";

export interface ReviewQueueEntry {
  /** The parsed extraction result that failed validation. */
  result: ExtractionResult;
  /** Copy of `result.extraction_warnings` at the time of routing. */
  warnings: string[];
  /** Tie-out violations found by `tieOut(result)`. */
  violations: TieOutViolation[];
  /** ISO 8601 timestamp of when the entry was queued. */
  queuedAt: string;
}

/** A queue that review entries are appended to; never mutated in place. */
export interface ReviewQueue {
  enqueue(entry: ReviewQueueEntry): void;
  list(): ReviewQueueEntry[];
  size(): number;
}

/** A store that clean (fully tied-out, warning-free) results are appended to. */
export interface CleanStore {
  add(result: ExtractionResult): void;
  list(): ExtractionResult[];
}

/** In-memory review queue; entries are lost when the process exits. */
export class InMemoryReviewQueue implements ReviewQueue {
  private readonly entries: ReviewQueueEntry[] = [];

  enqueue(entry: ReviewQueueEntry): void {
    this.entries.push(entry);
  }

  list(): ReviewQueueEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }
}

/** In-memory clean-result store; entries are lost when the process exits. */
export class InMemoryCleanStore implements CleanStore {
  private readonly results: ExtractionResult[] = [];

  add(result: ExtractionResult): void {
    this.results.push(result);
  }

  list(): ExtractionResult[] {
    return [...this.results];
  }
}

/**
 * Review queue backed by a JSON file: the whole entry list is read on
 * construction (if the file exists) and rewritten on every `enqueue`.
 * Sufficient for a low-volume manual-review workflow; not safe for
 * concurrent writers.
 *
 * Throws RangeError if `filePath` is blank.
 */
export class JsonFileReviewQueue implements ReviewQueue {
  private readonly filePath: string;
  private entries: ReviewQueueEntry[];

  constructor(filePath: string) {
    if (filePath.trim().length === 0) {
      throw new RangeError("filePath must be a non-empty string");
    }
    this.filePath = filePath;
    this.entries = existsSync(filePath)
      ? (JSON.parse(readFileSync(filePath, "utf-8")) as ReviewQueueEntry[])
      : [];
  }

  enqueue(entry: ReviewQueueEntry): void {
    this.entries.push(entry);
    writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), "utf-8");
  }

  list(): ReviewQueueEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }
}

export type RoutingDestination = "clean" | "review";

/**
 * Routes one parsed `ExtractionResult`: re-runs `tieOut` on it, and sends it
 * to `reviewQueue` if that result has non-empty `extraction_warnings` or any
 * tie-out violations; otherwise adds it to `cleanStore`. Returns which
 * destination the result was sent to.
 */
export function routeExtractionResult(
  result: ExtractionResult,
  reviewQueue: ReviewQueue,
  cleanStore: CleanStore,
): RoutingDestination {
  const violations = tieOut(result);
  if (result.extraction_warnings.length > 0 || violations.length > 0) {
    reviewQueue.enqueue({
      result,
      warnings: [...result.extraction_warnings],
      violations,
      queuedAt: new Date().toISOString(),
    });
    return "review";
  }

  cleanStore.add(result);
  return "clean";
}
