import { normalizeMatch, type ProviderMatchPayload } from "../normalization/normalize.js";
import type { Match } from "../domain/types.js";
import type { CricketProvider, ProviderQuery } from "./provider.js";

export interface HttpProviderOptions {
  id: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProviderHttpError(`Provider response has an invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function payloadFromResponse(value: unknown, multiple: boolean): ProviderMatchPayload | ProviderMatchPayload[] {
  const response = asRecord(value, "response envelope");
  const data = response.data;
  if (multiple) {
    if (!Array.isArray(data)) {
      throw new ProviderHttpError("Provider response data must be an array");
    }
    return data as ProviderMatchPayload[];
  }
  return asRecord(data, "match data") as unknown as ProviderMatchPayload;
}

export class HttpCricketProvider implements CricketProvider {
  readonly id: string;
  private readonly baseUrl: URL;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpProviderOptions) {
    if (!options.id.trim()) throw new Error("HTTP provider id is required");
    this.id = options.id;
    this.baseUrl = new URL(options.baseUrl);
    this.apiKey = options.apiKey;
    this.timeoutMs = Math.max(100, options.timeoutMs ?? 5000);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listMatches(query?: ProviderQuery): Promise<Match[]> {
    const url = this.endpoint("matches");
    if (query?.status) url.searchParams.set("status", query.status);
    if (query?.date) url.searchParams.set("date", query.date);
    const payload = payloadFromResponse(await this.request(url), true) as ProviderMatchPayload[];
    const fetchedAt = new Date().toISOString();
    return payload.map((match) => normalizeMatch(match, fetchedAt, this.id));
  }

  async getMatch(matchId: string): Promise<Match | undefined> {
    const payload = payloadFromResponse(
      await this.request(this.endpoint(`matches/${encodeURIComponent(matchId)}`)),
      false
    ) as ProviderMatchPayload;
    return normalizeMatch(payload, new Date().toISOString(), this.id);
  }

  private endpoint(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  private async request(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
        }
      });
      if (!response.ok) {
        throw new ProviderHttpError(
          `Provider request failed with HTTP ${response.status}`,
          response.status,
          response.status === 408 || response.status === 429 || response.status >= 500
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderHttpError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderHttpError(`Provider request timed out after ${this.timeoutMs}ms`, undefined, true);
      }
      throw new ProviderHttpError("Provider request failed", undefined, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}