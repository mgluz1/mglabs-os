import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { buildMcpServer } from "@/lib/mcp/server";
import { ctxFromToken } from "@/lib/services/tokens";

export const maxDuration = 30;

// Limite simples por token (por instância): 60 chamadas/min. Defesa extra; o banco guarda o uso real.
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
  return arr.length > 60;
}

const unauthorized = () => new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Token inválido, expirado ou revogado." }, id: null }), { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="mglabs-os"' } });

/**
 * Servidor MCP remoto (Streamable HTTP, sem sessão). Autenticação por token do próprio CRM
 * (Configurações → Claude Code), nunca por credenciais da assinatura Claude.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const ctx = await ctxFromToken(bearer);
  if (!ctx) return unauthorized();
  if (limited(bearer!)) return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32002, message: "Limite de chamadas por minuto atingido." }, id: null }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } });

  const server = buildMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // stateless: libera o servidor depois de responder
    void server.close();
  }
}

const notAllowed = () => new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Método não permitido (servidor sem sessão)." }, id: null }), { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
