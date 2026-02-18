// ---------------------------------------------------------------------------
// McmpClient – AFIP "Mis Comprobantes" (MCMP) service client
// ---------------------------------------------------------------------------

import {
  COMMON_HEADERS,
  extractFormAction,
  extractHiddenInputs,
  fetchWithCookieJar,
  formatCookies,
  hasAutoSubmit,
} from "@/lib/afipClient";
import AdmZip from "adm-zip";

// -- Types ------------------------------------------------------------------

export type ComprobanteType = "E" | "R";

interface ConsultationRef {
  type: ComprobanteType;
  idConsulta: string;
  refererPage: string;
}

export interface ConsultationResult {
  type: ComprobanteType;
  idConsulta: string;
  comprobantes: Record<string, string>[];
}

type CookieJar = Record<string, string>;

// -- Constants --------------------------------------------------------------

const MCMP_BASE = "https://fes.afip.gob.ar/mcmp/jsp";
const PORTAL_BASE = "https://portalcf.cloud.afip.gob.ar";

const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 1_000;
const RATE_LIMIT_DELAY_MS = 1_000;

/** Valid MCMP consultation ID: starts with "BL" followed by digits. */
const CONSULTATION_ID_RE = /^BL\d+$/;

/** Detect AFIP HTML error pages (session expired, server errors, etc.). */
function detectHtmlError(text: string): string | null {
  if (!/<\s*(!DOCTYPE|html)\b/i.test(text)) return null;
  const bodyMatch = text.match(
    /class\s*=\s*["']?panel-body["']?\s*>\s*([^<]+)/i,
  );
  return bodyMatch ? bodyMatch[1].trim() : "MCMP session expired or server error (HTML response)";
}

/** Check whether an error was caused by AFIP session expiration. */
function isSessionExpiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no se encuentra logueado|sesi.n expir/i.test(msg);
}

// ---------------------------------------------------------------------------
// McmpClient
// ---------------------------------------------------------------------------

export class McmpClient {
  private cookies: CookieJar = {};
  private entityPageHtml = "";
  private entityPageUrl = "";

  constructor(
    private cuit: string,
    private portalCookies: CookieJar,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fetch comprobantes for one or more queried CUITs.
   *
   * Initializes the MCMP session once, then processes each CUIT sequentially
   * (they share one server-side session).  If a session-expired error is
   * detected for a CUIT, the session is re-initialized and the CUIT is
   * retried once.
   */
  async fetchComprobantes(params: {
    queriedCuits: string[];
    dateFrom: string;
    dateTo: string;
    types: ComprobanteType[];
  }): Promise<Map<string, ConsultationResult[]>> {
    const { queriedCuits, dateFrom, dateTo, types } = params;

    await this.initSession();

    const allResults = new Map<string, ConsultationResult[]>();

    for (const qCuit of queriedCuits) {
      try {
        const results = await this.processCuit(qCuit, types, dateFrom, dateTo);
        allResults.set(qCuit, results);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          // Re-init session and retry once
          await this.initSession();
          const results = await this.processCuit(qCuit, types, dateFrom, dateTo);
          allResults.set(qCuit, results);
        } else {
          throw err;
        }
      }
    }

    return allResults;
  }

  /** Process a single queried CUIT: select entity → start consultations → poll & download. */
  private async processCuit(
    qCuit: string,
    types: ComprobanteType[],
    dateFrom: string,
    dateTo: string,
  ): Promise<ConsultationResult[]> {
    await this.selectEntity(qCuit);
    await this.activateComprobantesPage(types[0]);

    const started = await this.startConsultations(types, qCuit, dateFrom, dateTo);

    const results: ConsultationResult[] = [];
    for (const ref of started) {
      results.push(await this.pollAndDownload(ref));
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Session initialization
  // -------------------------------------------------------------------------

  /**
   * Authorize the MCMP service via the portal API and navigate through the SSO
   * redirect / auto-submit chain. Populates session state on the instance.
   */
  private async initSession(): Promise<void> {
    const { token, sign } = await this.getServiceAuthorization();

    const loginForm = new URLSearchParams({ token, sign });
    const mcmpLogin = await fetchWithCookieJar(
      `${MCMP_BASE}/index.do`,
      {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: PORTAL_BASE,
          Referer: `${PORTAL_BASE}/portal/app/`,
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
          "Upgrade-Insecure-Requests": "1",
        },
        body: loginForm.toString(),
      },
    );

    this.cookies = { ...mcmpLogin.cookies };
    const initialHtml = await mcmpLogin.response.text();
    const initialUrl = mcmpLogin.response.url || `${MCMP_BASE}/index.do`;

    const { html, url } = await this.followAutoSubmitChain(
      initialHtml, initialUrl,
    );
    this.entityPageHtml = html;
    this.entityPageUrl = url;

    if (!this.cookies.JSESSIONID) {
      throw new Error(
        `MCMP login did not return JSESSIONID (cookies: ${Object.keys(this.cookies).join(", ")})`,
      );
    }
  }

  /** Call the portal's service authorization API to obtain token + sign. */
  private async getServiceAuthorization(): Promise<{ token: string; sign: string }> {
    const url =
      `${PORTAL_BASE}/portal/api/servicios/${this.cuit}/servicio/mcmp/autorizacion`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...COMMON_HEADERS,
        Accept: "application/json, text/plain, */*",
        Referer: `${PORTAL_BASE}/portal/app/`,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Cookie: formatCookies(this.portalCookies),
      },
    });

    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new Error(
        `Portal authorization API failed (status ${res.status}): ${snippet.slice(0, 500)}`,
      );
    }

    const data = await res.json();
    if (!data.token || !data.sign) {
      throw new Error(
        `Authorization response missing token or sign: ${JSON.stringify(data)}`,
      );
    }

    return { token: data.token, sign: data.sign };
  }

  // -------------------------------------------------------------------------
  // Entity selection
  // -------------------------------------------------------------------------

  /** Select the contribuyente entity matching `queriedCuit` within the session. */
  private async selectEntity(queriedCuit: string): Promise<void> {
    const idContribuyente = McmpClient.findContribuyenteForCuit(
      this.entityPageHtml, queriedCuit,
    );
    await this.selectContribuyente(idContribuyente);
  }

  /** Call setearContribuyente.do with the resolved entity ID. */
  private async selectContribuyente(idContribuyente: string): Promise<void> {
    const res = await fetchWithCookieJar(
      `${MCMP_BASE}/setearContribuyente.do?idContribuyente=${idContribuyente}`,
      {
        method: "GET",
        headers: { ...COMMON_HEADERS, Referer: this.entityPageUrl },
      },
      this.cookies,
    );
    Object.assign(this.cookies, res.cookies);
    await res.response.text().catch(() => {});
  }

  /**
   * Find the idContribuyente value for a given CUIT on the entity selection page.
   *
   * The index.do page contains onclick handlers like:
   *   getElementById('idcontribuyente').value='N'
   * alongside the CUIT text (usually dashed: XX-XXXXXXXX-X).
   * We find all such assignments and pick the one whose surrounding HTML
   * contains the target CUIT in any format.
   */
  private static findContribuyenteForCuit(html: string, targetCuit: string): string {
    const regex =
      /getElementById\s*\(\s*['"]idcontribuyente['"]\s*\)\s*\.value\s*=\s*['"](\d+)['"]/gi;
    const assignments: { id: string; pos: number }[] = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
      assignments.push({ id: m[1], pos: m.index });
    }

    if (assignments.length === 0) return "0";
    if (assignments.length === 1) return assignments[0].id;

    const uniqueIds = [...new Set(assignments.map(a => a.id))];
    if (uniqueIds.length === 1) return uniqueIds[0];

    const variants = McmpClient.cuitSearchVariants(targetCuit);
    for (const { id, pos } of assignments) {
      const windowStart = Math.max(0, pos - 500);
      const windowEnd = Math.min(html.length, pos + 1000);
      const window = html.substring(windowStart, windowEnd);
      if (variants.some(v => window.includes(v))) return id;
    }

    return assignments[0].id;
  }

  /** Build search variants for a CUIT: plain digits and dashed format (XX-XXXXXXXX-X). */
  private static cuitSearchVariants(cuit: string): string[] {
    const plain = cuit.replace(/\D/g, "");
    const variants = [plain];
    if (plain.length === 11) {
      variants.push(`${plain.slice(0, 2)}-${plain.slice(2, 10)}-${plain.slice(10)}`);
    }
    return variants;
  }

  // -------------------------------------------------------------------------
  // Auto-submit form chain
  // -------------------------------------------------------------------------

  /**
   * Follow auto-submit forms from an already-fetched page.
   * AFIP SSO pages contain `<form onload="...submit()">` that browsers
   * execute automatically. Mutates `this.cookies` in place.
   */
  private async followAutoSubmitChain(
    html: string,
    url: string,
    maxSteps = 5,
  ): Promise<{ html: string; url: string }> {
    let currentHtml = html;
    let currentUrl = url;

    for (let step = 0; step < maxSteps; step++) {
      if (!hasAutoSubmit(currentHtml)) break;
      const action = extractFormAction(currentHtml);
      if (!action) break;

      const nextUrl = action.startsWith("http")
        ? action
        : new URL(action, currentUrl).toString();
      const fields = extractHiddenInputs(currentHtml);

      const res = await fetchWithCookieJar(
        nextUrl,
        {
          method: "POST",
          headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            "Upgrade-Insecure-Requests": "1",
          },
          body: fields.toString(),
        },
        this.cookies,
      );

      Object.assign(this.cookies, res.cookies);
      currentHtml = await res.response.text();
      currentUrl = res.response.url || nextUrl;
    }

    return { html: currentHtml, url: currentUrl };
  }

  // -------------------------------------------------------------------------
  // Comprobantes page & consultations
  // -------------------------------------------------------------------------

  /** Navigate to the first comprobantes page to activate query state. */
  private async activateComprobantesPage(firstType: ComprobanteType): Promise<void> {
    const page = McmpClient.pageForType(firstType);

    const res = await fetchWithCookieJar(
      `${MCMP_BASE}/${page}`,
      {
        method: "GET",
        headers: { ...COMMON_HEADERS, Referer: `${MCMP_BASE}/home.do` },
      },
      this.cookies,
    );
    Object.assign(this.cookies, res.cookies);
    await res.response.text().catch(() => {});
  }

  /** Start `generarConsulta` for each requested type, with a delay between calls. */
  private async startConsultations(
    types: ComprobanteType[],
    queriedCuit: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ConsultationRef[]> {
    const fechaEmision = `${dateFrom} - ${dateTo}`;
    const refs: ConsultationRef[] = [];

    for (let i = 0; i < types.length; i++) {
      if (i > 0) await McmpClient.sleep(RATE_LIMIT_DELAY_MS);

      const t = types[i];
      const refererPage = McmpClient.pageForType(t);
      const params = new URLSearchParams({
        f: "generarConsulta",
        t,
        fechaEmision,
        tiposComprobantes: "",
        cuitConsultada: queriedCuit,
      });

      const res = await fetch(`${MCMP_BASE}/ajax.do?${params}`, {
        method: "GET",
        headers: this.mcmpAjaxHeaders(refererPage),
      });

      const text = await res.text();

      // Detect HTML error pages (session expired, etc.) before any parsing
      const htmlErr = detectHtmlError(text);
      if (htmlErr) {
        throw new Error(
          `generarConsulta(${t}) for ${queriedCuit}: ${htmlErr}`,
        );
      }

      let data: { estado?: string; mensajeError?: string; datos?: { idConsulta?: string } };
      try {
        data = JSON.parse(text);
      } catch {
        // AFIP sometimes returns a plain-text consultation ID (e.g. "BL2618807657909 2026-02-16 11:47:47")
        const firstToken = text.trim().split(/\s/)[0] ?? "";
        if (CONSULTATION_ID_RE.test(firstToken)) {
          data = { estado: "ok", datos: { idConsulta: firstToken } };
        } else {
          throw new Error(
            `generarConsulta(${t}) returned non-JSON (status ${res.status}): ${text.slice(0, 500)}`,
          );
        }
      }

      if (data.estado !== "ok" || !data.datos?.idConsulta) {
        const afipMsg = data.mensajeError ?? "unknown";
        const label = t === "E" ? "emitidos" : "recibidos";
        throw new Error(
          `AFIP error querying comprobantes ${label} for ${queriedCuit}: ${afipMsg}`,
        );
      }

      refs.push({ type: t, idConsulta: data.datos.idConsulta, refererPage });
    }

    return refs;
  }

  // -------------------------------------------------------------------------
  // Polling & download
  // -------------------------------------------------------------------------

  /** Poll a started consultation until ready, then download + parse the CSV. */
  private async pollAndDownload(ref: ConsultationRef): Promise<ConsultationResult> {
    await this.pollUntilReady(ref.idConsulta, ref.refererPage);
    const comprobantes = await this.downloadComprobantes(
      ref.type, ref.idConsulta, ref.refererPage,
    );
    return { type: ref.type, idConsulta: ref.idConsulta, comprobantes };
  }

  /** Poll `consultarEstado` until the consultation leaves "PE" (pending) state. */
  private async pollUntilReady(
    idConsulta: string,
    refererPage: string,
  ): Promise<void> {
    const headers = this.mcmpAjaxHeaders(refererPage);

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await McmpClient.sleep(POLL_INTERVAL_MS);

      const params = new URLSearchParams({ f: "consultarEstado", id: idConsulta });
      const res = await fetch(`${MCMP_BASE}/ajax.do?${params}`, {
        method: "GET",
        headers,
      });

      const text = await res.text();

      const htmlErr = detectHtmlError(text);
      if (htmlErr) {
        throw new Error(`consultarEstado for ${idConsulta}: ${htmlErr}`);
      }

      try {
        const data = JSON.parse(text);
        if (data?.datos?.estado !== "PE") return;
      } catch {
        return;
      }
    }
  }

  /** Download the comprobantes CSV (possibly zipped), parse, and return rows. */
  private async downloadComprobantes(
    type: ComprobanteType,
    idConsulta: string,
    refererPage: string,
  ): Promise<Record<string, string>[]> {
    const params = new URLSearchParams({ id: idConsulta, tc: type, tf: "csv" });

    const res = await fetch(
      `${MCMP_BASE}/descargarComprobantes.do?${params}`,
      {
        method: "GET",
        headers: {
          ...COMMON_HEADERS,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          Referer: `${MCMP_BASE}/${refererPage}`,
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          Cookie: formatCookies(this.cookies),
        },
      },
    );

    const buffer = Buffer.from(await res.arrayBuffer());

    let csvContent: string;
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      csvContent = entries.length > 0 ? entries[0].getData().toString("utf-8") : "";
    } catch {
      csvContent = buffer.toString("utf-8");
    }

    // Guard: AFIP may return an HTML error page instead of CSV/ZIP
    const htmlErr = detectHtmlError(csvContent);
    if (htmlErr) {
      throw new Error(
        `downloadComprobantes(${type}, ${idConsulta}): ${htmlErr}`,
      );
    }

    return McmpClient.parseCsv(csvContent);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private static pageForType(t: ComprobanteType): string {
    return t === "E" ? "comprobantesEmitidos.do" : "comprobantesRecibidos.do";
  }

  /** Build standard AJAX headers for MCMP ajax.do requests. */
  private mcmpAjaxHeaders(refererPage: string): Record<string, string> {
    return {
      ...COMMON_HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${MCMP_BASE}/${refererPage}`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: formatCookies(this.cookies),
    };
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // CSV parsing
  // -------------------------------------------------------------------------

  /** Parse AFIP's semicolon-delimited CSV into an array of objects. */
  private static parseCsv(raw: string): Record<string, string>[] {
    const lines = raw
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    if (lines.length < 2) return [];

    const headers = McmpClient.splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = McmpClient.splitCsvLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? "";
      });
      return obj;
    });
  }

  /** Split a single CSV line on `;`, respecting double-quoted fields. */
  private static splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ";" && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }
}
