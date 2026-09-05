import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFreshness } from "../domain/freshness.js";
import type { CricketProvider, ProviderQuery } from "../providers/provider.js";
import { getEnabledLiveProvider } from "../providers/registry.js";

const publicDirectory = fileURLToPath(new URL("../../public/", import.meta.url));

const allowedStatuses = new Set<NonNullable<ProviderQuery["status"]>>([
  "live",
  "upcoming",
  "completed"
]);

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  response.end(payload);
}

function getPath(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://localhost");
}

async function sendStaticFile(response: ServerResponse, filename: string, contentType: string): Promise<void> {
  try {
    const content = await readFile(`${publicDirectory}${filename}`);
    response.writeHead(200, { "content-type": contentType });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "asset_not_found" });
  }
}

function parseQuery(url: URL): ProviderQuery {
  const statusValue = url.searchParams.get("status") ?? undefined;
  const date = url.searchParams.get("date") ?? undefined;

  if (statusValue && !allowedStatuses.has(statusValue as NonNullable<ProviderQuery["status"]>)) {
    throw new Error("status must be live, upcoming, or completed");
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  return {
    ...(statusValue ? { status: statusValue as NonNullable<ProviderQuery["status"]> } : {}),
    ...(date ? { date } : {})
  };
}

function presentMatch(match: Awaited<ReturnType<CricketProvider["getMatch"]>>, now: () => Date) {
  if (!match) {
    return undefined;
  }

  return {
    ...match,
    freshness: getFreshness(match, now())
  };
}

export function createApiHandler(provider: CricketProvider, now: () => Date = () => new Date()) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const url = getPath(request);
    const segments = url.pathname.split("/").filter(Boolean);

    try {
      if (url.pathname === "/api/health") {
        sendJson(response, 200, {
          status: "ok",
          provider: provider.id,
          liveProviderEnabled: getEnabledLiveProvider()?.id === provider.id
        });
        return;
      }

      if (url.pathname === "/") {
        await sendStaticFile(response, "index.html", "text/html; charset=utf-8");
        return;
      }

      if (url.pathname === "/app.js") {
        await sendStaticFile(response, "app.js", "text/javascript; charset=utf-8");
        return;
      }

      if (url.pathname === "/styles.css") {
        await sendStaticFile(response, "styles.css", "text/css; charset=utf-8");
        return;
      }

      if (url.pathname === "/api/matches") {
        const matches = await provider.listMatches(parseQuery(url));
        sendJson(response, 200, {
          data: matches.map((match) => presentMatch(match, now)),
          meta: {
            source: provider.id,
            count: matches.length
          }
        });
        return;
      }

      if (segments.length === 3 && segments[0] === "api" && segments[1] === "matches") {
        const match = await provider.getMatch(decodeURIComponent(segments[2]!));
        if (!match) {
          sendJson(response, 404, { error: "match_not_found" });
          return;
        }

        sendJson(response, 200, { data: presentMatch(match, now) });
        return;
      }

      sendJson(response, 404, { error: "route_not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      const isClientError = message.startsWith("status must") || message.startsWith("date must");
      sendJson(response, isClientError ? 400 : 500, {
        error: isClientError ? "invalid_query" : "internal_server_error",
        message: isClientError ? message : "The score service could not complete the request"
      });
    }
  };
}

export function createApiServer(provider: CricketProvider, now?: () => Date): Server {
  return createServer(createApiHandler(provider, now));
}