import {
  BulkItem,
  BulkResult,
  PendingWork,
  processWork,
  validateBulkItems,
} from "@/lib/bulkHelpers";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/bot/comprobantes/bulk
//
// Body: Array of BulkItem objects.
// Processes accounts in parallel batches of 5 with automatic retries.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json(
        {
          error: "Body must be a non-empty array of account objects",
          expected: [
            {
              cuit: "string",
              password: "string",
              queried_cuit: "string | string[]",
              date_from: "DD/MM/YYYY",
              date_to: "DD/MM/YYYY",
              type: "(optional) E|R",
            },
          ],
        },
        { status: 400 },
      );
    }

    const validationErrors = validateBulkItems(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 },
      );
    }

    const items: BulkItem[] = body;

    // Build initial work list — every queried CUIT is pending
    let pending: PendingWork[] = items.map((item, idx) => ({
      item,
      idx,
      cuitsToProcess: Array.isArray(item.queried_cuit)
        ? item.queried_cuit
        : [item.queried_cuit],
      priorResults: {},
    }));

    const finalResults: (BulkResult & { _idx: number })[] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      const roundResults: { work: PendingWork; result: BulkResult }[] = [];

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        const batch = pending.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (work) => ({
            work,
            result: await processWork(work),
          })),
        );
        roundResults.push(...batchResults);
      }

      const nextPending: PendingWork[] = [];

      for (const { work, result } of roundResults) {
        const hasErrors =
          (result.errors && Object.keys(result.errors).length > 0) ||
          (!result.success && !!result.error);

        if (!hasErrors) {
          // Fully succeeded — done
          finalResults.push({ ...result, _idx: work.idx });
        } else if (attempt === MAX_RETRIES) {
          // Last attempt — accept whatever we got
          finalResults.push({ ...result, _idx: work.idx });
        } else if (!result.success && result.error) {
          // Full failure (e.g. login failed) — retry everything
          nextPending.push({
            ...work,
            cuitsToProcess: work.cuitsToProcess,
            priorResults: work.priorResults,
          });
        } else {
          // Partial failure — carry forward successes, retry only failed CUITs
          const successResults = result.results ?? {};
          const failedCuits = Object.keys(result.errors!);
          nextPending.push({
            ...work,
            cuitsToProcess: failedCuits,
            priorResults: { ...work.priorResults, ...successResults },
          });
        }
      }

      pending = nextPending;
      if (pending.length === 0) break;
    }

    // Sort back to original order and strip internal index
    finalResults.sort((a, b) => a._idx - b._idx);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const results: BulkResult[] = finalResults.map(({ _idx, ...rest }) => rest);

    const succeeded = results.filter(
      (r) => r.success && !r.errors,
    ).length;
    const partial = results.filter(
      (r) => r.success && !!r.errors,
    ).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      partial,
      failed,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Error in bulk comprobantes flow", details: message },
      { status: 500 },
    );
  }
}

