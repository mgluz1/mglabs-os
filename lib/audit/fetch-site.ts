import "server-only";

const UA = `RadarLeadsBot/0.1 (+contato: ${process.env.BOT_CONTACT_EMAIL ?? "contato@mglabs.com.br"})`;
const MAX_BYTES = 1_500_000;

export type FetchedPage = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };

/** Bloqueia destinos internos (SSRF): localhost, IPs privados/link-local, portas não-web. */
export function isPublicWebUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && !["80", "443", "8080"].includes(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127))
      return false;
  }
  if (h.includes(":")) return false; // IPv6 literal: não há motivo para um site comercial usar
  return true;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** fetch que segue até 5 redirecionamentos, validando cada destino. */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isPublicWebUrl(current)) throw new Error("endereço não permitido");
    const res = await fetch(current, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    Object.defineProperty(res, "url", { value: current });
    return res;
  }
  throw new Error("redirecionamentos demais");
}

/** robots.txt: respeita Disallow para `*` e para o nosso bot na raiz "/". */
export async function robotsAllows(siteUrl: string): Promise<boolean> {
  try {
    const u = new URL(withScheme(siteUrl));
    const res = await safeFetch(`${u.origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) return true;
    const txt = (await res.text()).slice(0, 100_000);
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || /radarleadsbot/i.test(v);
      else if (applies && /^disallow$/i.test(k) && (v === "/" || v === "/*")) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function fetchHomepage(siteUrl: string): Promise<FetchedPage> {
  const url = withScheme(siteUrl);
  if (!isPublicWebUrl(url)) return { ok: false, reason: "endereço não permitido" };
  if (!(await robotsAllows(url))) return { ok: false, reason: "robots.txt não permite" };
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) return { ok: false, reason: `não é HTML (${type || "sem tipo"})` };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, reason: "sem corpo" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    return { ok: true, html, finalUrl: res.url || url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: /timeout|abort/i.test(msg) ? "tempo esgotado" : msg.slice(0, 200) };
  }
}
