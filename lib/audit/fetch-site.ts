import "server-only";

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const UA = `RadarLeadsBot/0.1 (+contato: ${process.env.BOT_CONTACT_EMAIL ?? "contato@mglabs.com.br"})`;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080"]);

export type FetchedPage = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };
export type ResolvedAddress = { address: string; family: 4 | 6 };
export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return parts;
}

export function isPublicIpv4(ip: string): boolean {
  const p = parseIpv4(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0) return false; // 0.0.0.0/8 ("this network")
  if (a === 10) return false; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return false; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 (link-local / metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24 (IETF protocol)
  if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && c === 99) return false; // 192.88.99.0/24 (6to4 relay)
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return false; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast
  return true;
}

function expandIpv6(raw: string): number[] | null {
  if (!raw || raw.includes("%")) return null; // rejeita zone IDs link-local
  let ip = raw.toLowerCase();
  const lastColon = ip.lastIndexOf(":");
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(ip.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    ip = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parsePart = (s: string) => (s === "" ? [] : s.split(":"));
  const left = parsePart(halves[0]);
  const right = halves.length === 2 ? parsePart(halves[1]) : [];
  const total = left.length + right.length;
  if (halves.length === 1 && total !== 8) return null;
  if (halves.length === 2 && total >= 8) return null;
  const zeros = halves.length === 2 ? Array(8 - total).fill("0") : [];
  const groups = [...left, ...zeros, ...right];
  if (groups.length !== 8) return null;
  const nums: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    nums.push(parseInt(g, 16));
  }
  return nums;
}

export function isPublicIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return false;
  // ::, ::1 e ::/96 (IPv4-compatible obsoleto)
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return false;
  // ::ffff:0:0/96 (IPv4-mapped IPv6): valida o IPv4 embutido
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    const embedded = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPublicIpv4(embedded);
  }
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // 100::/64 discard
  if (g[0] === 0x0064 && g[1] === 0xff9b && (g[2] === 0x0001 || (g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0))) return false; // NAT64
  if (g[0] === 0x2001 && g[1] === 0x0000) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // Documentation
  if (g[0] === 0x2002) return false; // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}

export function isPublicIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPublicIpv4(ip);
  if (kind === 6) return isPublicIpv6(ip);
  return false;
}

/** Bloqueia destinos internos óbvios (SSRF) antes mesmo do DNS. */
export function isPublicWebUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (!ALLOWED_PORTS.has(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || h.endsWith(".localdomain") || h.endsWith(".arpa") || h.endsWith(".home")) {
    return false;
  }
  if (h.includes(":")) return false; // IPv6 literal em URL: rejeita
  const ipKind = net.isIP(h);
  if (ipKind === 4) return isPublicIpv4(h);
  if (ipKind === 6) return false;
  if (!h.includes(".")) return false; // hostname sem TLD (ex.: metadata, redis, db)
  return true;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const defaultLookup: LookupFn = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Resolve o DNS e garante que TODOS os IPs retornados sejam públicos (previne DNS para rede interna). */
export async function resolvePublicAddresses(rawUrl: string, lookupImpl: LookupFn = defaultLookup): Promise<ResolvedAddress[]> {
  if (!isPublicWebUrl(rawUrl)) throw new Error("endereço não permitido");
  const u = new URL(rawUrl);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ipKind = net.isIP(host);
  if (ipKind === 4) {
    if (!isPublicIpv4(host)) throw new Error("endereço não permitido");
    return [{ address: host, family: 4 }];
  }
  let resolved: ResolvedAddress[];
  try {
    resolved = await lookupImpl(host);
  } catch {
    throw new Error("falha ao resolver domínio");
  }
  if (!resolved.length || resolved.some((r) => !isPublicIp(r.address))) {
    throw new Error("endereço não permitido");
  }
  return resolved;
}

type RawHttpResult = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

/**
 * Executa requisição HTTP/HTTPS fixando o socket nos IPs validados (previne DNS rebinding),
 * preservando Host/SNI originais e sem seguir redirecionamentos automaticamente.
 */
function requestPinned(
  targetUrl: string,
  pinned: ResolvedAddress[],
  opts: { headers: Record<string, string>; timeoutMs: number; maxBytes: number },
): Promise<RawHttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const isHttps = u.protocol === "https:";
    const mod = isHttps ? https : http;
    let settled = false;
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : isHttps ? 443 : 80,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: {
          ...opts.headers,
          "Accept-Encoding": "gzip, deflate, br",
        },
        // Fixa a resolução no IP já validado (evita segunda consulta DNS / rebinding).
        lookup: ((_host: string, lopts: unknown, cb: (...args: unknown[]) => void) => {
          const callback = typeof lopts === "function" ? (lopts as (...args: unknown[]) => void) : cb;
          const wantsAll = typeof lopts === "object" && lopts !== null && "all" in lopts && Boolean((lopts as { all?: boolean }).all);
          if (wantsAll) callback(null, pinned);
          else callback(null, pinned[0].address, pinned[0].family);
        }) as never,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (!settled) {
            settled = true;
            resolve({ status, headers: res.headers, body: "" });
          }
          return;
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip"
            ? res.pipe(createGunzip())
            : encoding === "deflate"
              ? res.pipe(createInflate())
              : encoding === "br"
                ? res.pipe(createBrotliDecompress())
                : res;

        const chunks: Buffer[] = [];
        let size = 0;
        const onEnd = () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf-8") });
        };
        stream.on("data", (chunk: Buffer) => {
          if (settled) return;
          const remaining = opts.maxBytes - size;
          if (remaining <= 0) {
            res.destroy();
            stream.destroy();
            onEnd();
            return;
          }
          const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
          chunks.push(slice);
          size += slice.byteLength;
          if (size >= opts.maxBytes) {
            res.destroy();
            stream.destroy();
            onEnd();
          }
        });
        stream.on("end", onEnd);
        stream.on("error", (err) => finishErr(err instanceof Error ? err : new Error(String(err))));
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("tempo esgotado"));
    });
    req.on("error", (err) => finishErr(err instanceof Error ? err : new Error(String(err))));
    req.end();
  });
}

export type FetchDeps = {
  lookup?: LookupFn;
  request?: typeof requestPinned;
};

/** fetch seguro que resolve/valida DNS e segue até 5 redirecionamentos validando cada salto. */
export async function safeFetch(
  url: string,
  opts: { headers: Record<string, string>; timeoutMs: number; maxBytes?: number },
  deps: FetchDeps = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; finalUrl: string }> {
  const lookupImpl = deps.lookup ?? defaultLookup;
  const requestImpl = deps.request ?? requestPinned;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const pinned = await resolvePublicAddresses(current, lookupImpl);
    const res = await requestImpl(current, pinned, {
      headers: opts.headers,
      timeoutMs: opts.timeoutMs,
      maxBytes: opts.maxBytes ?? MAX_BYTES,
    });
    const locHeader = res.headers.location;
    const loc = Array.isArray(locHeader) ? locHeader[0] : locHeader;
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return { ...res, finalUrl: current };
  }
  throw new Error("redirecionamentos demais");
}

/** robots.txt: respeita Disallow para `*` e para o nosso bot na raiz "/". */
export async function robotsAllows(siteUrl: string, deps: FetchDeps = {}): Promise<{ allowed: boolean; ssrfError?: string }> {
  try {
    const u = new URL(withScheme(siteUrl));
    const res = await safeFetch(
      `${u.origin}/robots.txt`,
      { headers: { "User-Agent": UA }, timeoutMs: 5_000, maxBytes: 100_000 },
      deps,
    );
    if (res.status < 200 || res.status >= 300) return { allowed: true };
    const txt = res.body.slice(0, 100_000);
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || /radarleadsbot/i.test(v);
      else if (applies && /^disallow$/i.test(k) && (v === "/" || v === "/*")) return { allowed: false };
    }
    return { allowed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "endereço não permitido") return { allowed: false, ssrfError: msg };
    return { allowed: true };
  }
}

export async function fetchHomepage(siteUrl: string, deps: FetchDeps = {}): Promise<FetchedPage> {
  const url = withScheme(siteUrl);
  if (!isPublicWebUrl(url)) return { ok: false, reason: "endereço não permitido" };
  try {
    await resolvePublicAddresses(url, deps.lookup);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "endereço não permitido" };
  }
  const robots = await robotsAllows(url, deps);
  if (robots.ssrfError) return { ok: false, reason: robots.ssrfError };
  if (!robots.allowed) return { ok: false, reason: "robots.txt não permite" };
  try {
    const res = await safeFetch(
      url,
      { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, timeoutMs: 10_000, maxBytes: MAX_BYTES },
      deps,
    );
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` };
    const typeHeader = res.headers["content-type"];
    const type = Array.isArray(typeHeader) ? typeHeader.join("; ") : (typeHeader ?? "");
    if (!/html/i.test(type)) return { ok: false, reason: `não é HTML (${type || "sem tipo"})` };
    return { ok: true, html: res.body, finalUrl: res.finalUrl || url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: /timeout|abort|tempo esgotado/i.test(msg) ? "tempo esgotado" : msg.slice(0, 200) };
  }
}
