// ---------------------------------------------------------------------------
// Shared types and helpers for bulk comprobantes processing
// ---------------------------------------------------------------------------

import { afipLogin } from "@/lib/afipClient";
import {
  ComprobanteType,
  ConsultationResult,
  McmpClient,
} from "@/lib/mcmpClient";

// -- Types ------------------------------------------------------------------

export interface BulkItem {
  cuit: string;
  password: string;
  queried_cuit: string | string[];
  date_from: string;
  date_to: string;
  type?: string;
}

export interface BulkResult {
  cuit: string;
  queried_cuit: string[];
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  results?: Record<string, unknown>;
  emitidos?: { idConsulta: string; count: number; comprobantes: unknown[] };
  recibidos?: { idConsulta: string; count: number; comprobantes: unknown[] };
  type?: string;
  idConsulta?: string;
  count?: number;
  comprobantes?: unknown[];
}

export interface PendingWork {
  item: BulkItem;
  idx: number;
  cuitsToProcess: string[];
  priorResults: Record<string, unknown>;
}

// -- Validation -------------------------------------------------------------

const REQUIRED_FIELDS = ["cuit", "password", "queried_cuit", "date_from", "date_to"];

/** Validate an array of bulk items, returning human-readable error strings. */
export function validateBulkItems(items: Record<string, unknown>[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const missing = REQUIRED_FIELDS.filter((f) => !items[i][f]);
    if (missing.length > 0) {
      errors.push(`Item [${i}]: missing fields: ${missing.join(", ")}`);
    }
  }
  return errors;
}

// -- Response formatting ----------------------------------------------------

/** Format consultation results for a single queried CUIT. */
export function formatCuitResults(
  types: ComprobanteType[],
  results: ConsultationResult[],
): Record<string, unknown> {
  if (types.length === 1) {
    const r = results[0];
    return {
      type: types[0],
      idConsulta: r.idConsulta,
      count: r.comprobantes.length,
      comprobantes: r.comprobantes,
    };
  }

  const emitidos = results.find((r) => r.type === "E");
  const recibidos = results.find((r) => r.type === "R");
  return {
    emitidos: emitidos
      ? { idConsulta: emitidos.idConsulta, count: emitidos.comprobantes.length, comprobantes: emitidos.comprobantes }
      : undefined,
    recibidos: recibidos
      ? { idConsulta: recibidos.idConsulta, count: recibidos.comprobantes.length, comprobantes: recibidos.comprobantes }
      : undefined,
  };
}

// -- Per-item processing ----------------------------------------------------

/**
 * Process a single work unit: login to AFIP, then fetch comprobantes for the
 * CUITs listed in `cuitsToProcess`, merging with any `priorResults` carried
 * from earlier retry rounds.
 */
export async function processWork(work: PendingWork): Promise<BulkResult> {
  const { item, cuitsToProcess, priorResults } = work;
  const { cuit, password, date_from, date_to, type } = item;
  const allQueriedCuits: string[] = Array.isArray(item.queried_cuit)
    ? item.queried_cuit
    : [item.queried_cuit];

  let portalCookies: Record<string, string>;
  try {
    ({ portalCookies } = await afipLogin(cuit, password));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cuit, queried_cuit: allQueriedCuits, success: false, error: message };
  }

  const types: ComprobanteType[] = type ? [type as ComprobanteType] : ["E", "R"];

  const perCuitResults: Record<string, unknown> = { ...priorResults };
  const perCuitErrors: Record<string, string> = {};

  for (const qCuit of cuitsToProcess) {
    try {
      const client = new McmpClient(cuit, portalCookies);
      const result = await client.fetchComprobantes({
        queriedCuits: [qCuit],
        dateFrom: date_from,
        dateTo: date_to,
        types,
      });
      perCuitResults[qCuit] = formatCuitResults(types, result.get(qCuit)!);
    } catch (err: unknown) {
      perCuitErrors[qCuit] = err instanceof Error ? err.message : String(err);
    }
  }

  const hasResults = Object.keys(perCuitResults).length > 0;
  const hasErrors = Object.keys(perCuitErrors).length > 0;

  if (allQueriedCuits.length === 1) {
    if (hasErrors) {
      return {
        cuit,
        queried_cuit: allQueriedCuits,
        success: false,
        error: perCuitErrors[allQueriedCuits[0]],
      };
    }
    return {
      cuit,
      queried_cuit: allQueriedCuits,
      success: true,
      ...(perCuitResults[allQueriedCuits[0]] as Record<string, unknown>),
    };
  }

  return {
    cuit,
    queried_cuit: allQueriedCuits,
    success: hasResults,
    results: hasResults ? perCuitResults : undefined,
    ...(hasErrors ? { errors: perCuitErrors } : {}),
  };
}
