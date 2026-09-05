import type { ProviderDefinition } from "../domain/types.js";

export const providerRegistry: ProviderDefinition[] = [
  {
    id: "fixture",
    name: "Local development fixture",
    enabled: true,
    approval: {
      approved: true,
      redistributionAllowed: true,
      attribution: "Development data only; not a live data provider."
    },
    capabilities: {
      liveScores: false,
      competitions: ["development"],
      ballByBall: false
    }
  }
];

export function getEnabledLiveProvider(): ProviderDefinition | undefined {
  return providerRegistry.find(
    (provider) =>
      provider.enabled &&
      provider.approval.approved &&
      provider.approval.redistributionAllowed &&
      provider.capabilities.liveScores
  );
}

export function hasApprovedProvider(provider: ProviderDefinition): boolean {
  return provider.approval.approved && provider.approval.redistributionAllowed;
}