import {
  BulkItem,
  BulkResult,
  PendingWork,
  processWork,
  validateBulkItems,
} from "@/lib/bulkHelpers";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/bot/comprobantes/bulk/stream
//
// Same body as /api/bot/comprobantes/bulk but returns a Server-Sent Events
// stream so the client can track per-account progress in real time.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json(
      { error: "Body must be a non-empty array of account objects" },
      { status: 400 },
    );
  }

  const validationErrors = validateBulkItems(body as Record<string, unknown>[]);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "Validation failed", details: validationErrors },
      { status: 400 },
    );
  }

  const items: BulkItem[] = body;
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: unknown) => {
    try {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      // Client disconnected — silently ignore
    }
  };

  // Fire-and-forget the async processing
  (async () => {
    try {
      // ── init ──
      await send({
        type: "init",
        total: items.length,
        items: items.map((item, i) => ({
          index: i,
          cuit: item.cuit,
          queried_cuit: item.queried_cuit,
        })),
      });

      // Build initial work list
      let pending: PendingWork[] = items.map((item, idx) => ({
        item,
        idx,
        cuitsToProcess: Array.isArray(item.queried_cuit)
          ? item.queried_cuit
          : [item.queried_cuit],
        priorResults: {},
      }));

      const finalResults: Map<number, { result: BulkResult; duration: number }> =
        new Map();

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await send({
            type: "retry_round",
            attempt,
            count: pending.length,
            indices: pending.map((p) => p.idx),
          });
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }

        const roundResults: {
          work: PendingWork;
          result: BulkResult;
          duration: number;
        }[] = [];

        for (let i = 0; i < pending.length; i += BATCH_SIZE) {
          if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
          const batch = pending.slice(i, i + BATCH_SIZE);

          // Notify that each item in the batch is being processed
          for (const work of batch) {
            await send({
              type: "processing",
              index: work.idx,
              cuit: work.item.cuit,
              attempt,
            });
          }

          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map(async (work) => {
              const startTime = Date.now();
              const result = await processWork(work);
              const duration = Date.now() - startTime;
              return { work, result, duration };
            }),
          );

          // Stream individual results as they complete
          for (const { work, result, duration } of batchResults) {
            const hasErrors =
              (result.errors &&
                Object.keys(result.errors).length > 0) ||
              (!result.success && !!result.error);
            const isFinal = !hasErrors || attempt === MAX_RETRIES;

            await send({
              type: "item_result",
              index: work.idx,
              cuit: work.item.cuit,
              success: result.success,
              hasErrors,
              isFinal,
              attempt,
              duration,
              result,
            });

            roundResults.push({ work, result, duration });
          }
        }

        // Categorize: done vs. needs retry (same logic as bulk route)
        const nextPending: PendingWork[] = [];

        for (const { work, result, duration } of roundResults) {
          const hasErrors =
            (result.errors && Object.keys(result.errors).length > 0) ||
            (!result.success && !!result.error);

          if (!hasErrors) {
            finalResults.set(work.idx, { result, duration });
          } else if (attempt === MAX_RETRIES) {
            finalResults.set(work.idx, { result, duration });
          } else if (!result.success && result.error) {
            nextPending.push({
              ...work,
              cuitsToProcess: work.cuitsToProcess,
              priorResults: work.priorResults,
            });
          } else {
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

      // ── complete ──
      const allResults = Array.from(finalResults.values()).map((v) => v.result);
      const succeeded = allResults.filter(
        (r) => r.success && !r.errors,
      ).length;
      const partial = allResults.filter(
        (r) => r.success && !!r.errors,
      ).length;
      const failed = allResults.filter((r) => !r.success).length;

      await send({
        type: "complete",
        summary: {
          total: items.length,
          succeeded,
          partial,
          failed,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await send({ type: "error", message });
    } finally {
      try {
        await writer.close();
      } catch {
        // ignore
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    },
  });
}

