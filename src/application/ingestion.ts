import type { Match } from "../domain/types.js";
import type { MatchRepository } from "../storage/match-repository.js";
import type { CricketProvider } from "../providers/provider.js";

export interface IngestionOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface IngestionResult {
  matches: Match[];
  attempts: number;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class IngestionCoordinator {
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private activeRefresh: Promise<IngestionResult> | undefined;

  constructor(
    private readonly provider: CricketProvider,
    private readonly repository: MatchRepository,
    options: IngestionOptions = {}
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
    this.sleep = options.sleep ?? defaultSleep;
  }

  async refresh(): Promise<IngestionResult> {
    if (this.activeRefresh) {
      return this.activeRefresh;
    }

    this.activeRefresh = this.refreshFromProvider();
    try {
      return await this.activeRefresh;
    } finally {
      this.activeRefresh = undefined;
    }
  }

  startPolling(intervalMs: number, onError: (error: unknown) => void = console.error): () => void {
    const timer = setInterval(() => {
      void this.refresh().catch(onError);
    }, Math.max(1000, intervalMs));
    timer.unref();
    return () => clearInterval(timer);
  }

  private async refreshFromProvider(): Promise<IngestionResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const matches = await this.provider.listMatches();
        await this.repository.replace(matches);
        return { matches, attempts: attempt };
      } catch (error) {
        lastError = error;
        if (attempt < this.maxAttempts) {
          await this.sleep(this.retryDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Provider refresh failed");
  }
}