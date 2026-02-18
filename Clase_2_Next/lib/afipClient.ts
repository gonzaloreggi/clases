// ---------------------------------------------------------------------------
// Shared AFIP authentication helpers
// ---------------------------------------------------------------------------

export const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "es-US,es;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Connection: "keep-alive",
  "sec-ch-ua":
    '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Extract every Set-Cookie from a Response into a name→value map. */
export function extractCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookieHeaders) {
    const [nameValue] = cookie.split(";");
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx === -1) continue;
    cookies[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
  }
  return cookies;
}

/** Format cookie maps into a `Cookie` header string. */
export function formatCookies(...maps: Record<string, string>[]): string {
  const merged: Record<string, string> = {};
  for (const m of maps) Object.assign(merged, m);
  return Object.entries(merged)
    .map(([n, v]) => `${n}=${v}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * Robustly extract the `value` of an <input> whose `name` equals `fieldName`.
 * Handles attributes in any order.
 */
export function extractInputValue(html: string, fieldName: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m1 = html.match(new RegExp(`name="${escaped}"[^>]*?value="([^"]+)"`));
  if (m1) return m1[1];
  const m2 = html.match(new RegExp(`value="([^"]+)"[^>]*?name="${escaped}"`));
  if (m2) return m2[1];
  return null;
}

// ---------------------------------------------------------------------------
// Fetch with cookie accumulation
// ---------------------------------------------------------------------------

/**
 * Fetch that manually follows redirects while accumulating Set-Cookie headers
 * at every hop.  Returns the final response + the full cookie jar.
 */
export async function fetchWithCookieJar(
  url: string,
  init: RequestInit & { headers: Record<string, string> },
  existingCookies: Record<string, string> = {},
  maxRedirects = 10
): Promise<{ response: Response; cookies: Record<string, string> }> {
  const jar = { ...existingCookies };
  let currentUrl = url;
  let method = init.method ?? "GET";
  let body = init.body;

  for (let i = 0; i < maxRedirects; i++) {
    const cookieHeader = formatCookies(jar);
    const res = await fetch(currentUrl, {
      ...init,
      method,
      body,
      headers: {
        ...init.headers,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "manual",
    });

    Object.assign(jar, extractCookies(res));

    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get("location");
      if (!location) return { response: res, cookies: jar };
      currentUrl = new URL(location, currentUrl).toString();
      method = "GET";
      body = undefined;
      await res.text().catch(() => {});
      continue;
    }

    return { response: res, cookies: jar };
  }

  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------------------
// Auto-submit form chain follower
// ---------------------------------------------------------------------------

/**
 * Extract all hidden <input> fields from an HTML string.
 * Handles attributes in any order.
 */
export function extractHiddenInputs(html: string): URLSearchParams {
  const fields = new URLSearchParams();
  const inputRegex = /<input\s[^>]*?type\s*=\s*["']hidden["'][^>]*?>/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const tag = match[0];
    const name = tag.match(/name\s*=\s*["']([^"']+)["']/)?.[1];
    const value = tag.match(/value\s*=\s*["']([^"']*?)["']/)?.[1];
    if (name) fields.append(name, value ?? "");
  }
  return fields;
}

/** Return the `action` URL from the first <form> in the HTML, or null. */
export function extractFormAction(html: string): string | null {
  return html.match(/<form[^>]*?action\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

/** True when the page body auto-submits a form on load. */
export function hasAutoSubmit(html: string): boolean {
  return /onload\s*=\s*["'][^"']*submit\s*\(\s*\)/i.test(html);
}

// ---------------------------------------------------------------------------
// Full AFIP login flow (4 steps)
// ---------------------------------------------------------------------------

export interface AfipLoginResult {
  jwt: string;
  authCookies: Record<string, string>;
  portalCookies: Record<string, string>;
}

/**
 * Performs the full AFIP login flow:
 *  1. GET  login.xhtml           → cookies + ViewState (CUIT form)
 *  2. POST login.xhtml (CUIT)    → cookies + ViewState (password form)
 *  3. POST loginClave.xhtml      → JWT
 *  4. POST portal/login (JWT)    → portal session cookies (AFIPSID)
 *
 * Throws an Error with a descriptive message on failure.
 */
export async function afipLogin(cuit: string, password: string): Promise<AfipLoginResult> {
  // Step 1 – GET login.xhtml
  const step1 = await fetchWithCookieJar(
    "https://auth.afip.gob.ar/contribuyente_/login.xhtml",
    {
      method: "GET",
      headers: { ...COMMON_HEADERS, "Upgrade-Insecure-Requests": "1" },
    }
  );
  const loginPageHtml = await step1.response.text();
  const viewState1 = extractInputValue(loginPageHtml, "javax.faces.ViewState");
  if (!viewState1) {
    throw new Error(
      `Step 1 failed: could not extract ViewState from login.xhtml (status ${step1.response.status})`
    );
  }

  // Step 2 – POST CUIT ("Siguiente")
  const cuitForm = new URLSearchParams();
  cuitForm.append("F1", "F1");
  cuitForm.append("F1:username", cuit);
  cuitForm.append("F1:btnSiguiente", "Siguiente");
  cuitForm.append("javax.faces.ViewState", viewState1);

  const step2 = await fetchWithCookieJar(
    "https://auth.afip.gob.ar/contribuyente_/login.xhtml",
    {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://auth.afip.gob.ar",
        Referer: "https://auth.afip.gob.ar/contribuyente_/login.xhtml",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      body: cuitForm.toString(),
    },
    step1.cookies
  );
  const step2Html = await step2.response.text();
  const viewState2 = extractInputValue(step2Html, "javax.faces.ViewState");
  if (!viewState2) {
    throw new Error(
      `Step 2 failed: could not extract ViewState from password page (status ${step2.response.status})`
    );
  }

  // Step 3 – POST credentials
  const loginForm = new URLSearchParams();
  loginForm.append("F1", "F1");
  loginForm.append("F1:captcha", "");
  loginForm.append("F1:username", cuit);
  loginForm.append("F1:password", password);
  loginForm.append("F1:btnIngresar", "Ingresar");
  loginForm.append("javax.faces.ViewState", viewState2);

  const step3 = await fetchWithCookieJar(
    "https://auth.afip.gob.ar/contribuyente_/loginClave.xhtml",
    {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://auth.afip.gob.ar",
        Referer: "https://auth.afip.gob.ar/contribuyente_/login.xhtml",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      body: loginForm.toString(),
    },
    step2.cookies
  );
  const step3Html = await step3.response.text();
  const jwt = extractInputValue(step3Html, "jwt");
  if (!jwt) {
    throw new Error(
      `Step 3 failed: could not extract JWT (status ${step3.response.status}, ` +
        `hint: wrong credentials?). HTML snippet: ${step3Html.slice(0, 300)}`
    );
  }

  // Step 4 – POST JWT to portal (follow redirects to fully establish session)
  const portalForm = new URLSearchParams();
  portalForm.append("jwt", jwt);

  const step4 = await fetchWithCookieJar(
    "https://portalcf.cloud.afip.gob.ar/portal/login",
    {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://auth.afip.gob.ar",
        Referer: "https://auth.afip.gob.ar/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-site",
        "Upgrade-Insecure-Requests": "1",
      },
      body: portalForm.toString(),
    }
  );

  // Consume the response body so the connection can be reused
  await step4.response.text().catch(() => {});

  return {
    jwt,
    authCookies: step3.cookies,
    portalCookies: step4.cookies,
  };
}
