/**
 * FlowVid Feature Gate Hook
 *
 * Reads subscription status and exposes tier-based feature flags.
 * Only three features are gated behind FlowVid+:
 *   1. Family Profiles ("Who's Watching") — TorBox multi-IP enables simultaneous streams
 *   2. Native In-App Scrapers — 11 direct scrapers for zero addon dependency
 *   3. Managed TorBox — auto-provisioned, zero-setup debrid
 *
 * Everything else (MPV player, subtitle customization, quality presets,
 * source selection, cloud sync, library) is free for all users.
 */

import { useSubscriptionStore } from "../stores/subscriptionStore";

export type Tier = "free" | "FlowVid_plus";

export type GatedFeature =
  | "family_profiles"
  | "native_scrapers"
  | "managed_torbox";

const FEATURE_INFO: Record<
  GatedFeature,
  { title: string; description: string }
> = {
  family_profiles: {
    title: "Family Profiles",
    description:
      "Share FlowVid with your whole household. Everyone gets their own profile, watchlist, and continue watching — and can stream on different devices at the same time without conflicts.",
  },
  native_scrapers: {
    title: "In-App Scrapers",
    description:
      "11 independent scraping sources built right into the app. When addon services go down, FlowVid+ keeps finding sources. More sources means better quality matches and rare content that addons miss.",
  },
  managed_torbox: {
    title: "Managed TorBox",
    description:
      "Zero-setup streaming. Subscribe and your TorBox account is automatically provisioned — no API key hunting, no manual configuration. Just click and watch.",
  },
};

export function getFeatureInfo(feature: GatedFeature) {
  return FEATURE_INFO[feature];
}

export function getAllGatedFeatures() {
  return Object.entries(FEATURE_INFO).map(([key, info]) => ({
    key: key as GatedFeature,
    ...info,
  }));
}

/**
 * Determine tier from subscription status.
 * Only "active" subscriptions unlock FlowVid+ features.
 */
function deriveTier(status: string | undefined): Tier {
  return status === "active" ? "FlowVid_plus" : "free";
}

export function useFeatureGate() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const status = subscription?.status;

  const tier = deriveTier(status);
  const isPaid = tier === "FlowVid_plus";

  return {
    /** Current tier: "free" or "FlowVid_plus" */
    tier,
    /** Whether user has an active FlowVid+ subscription */
    isPaid,
    /** Can use family profiles ("Who's Watching", up to 8 profiles) */
    canUseProfiles: isPaid,
    /** Can use native in-app scrapers (11 direct scrapers) */
    canUseNativeScrapers: isPaid,
    /** Has managed TorBox (auto-provisioned) */
    hasManagedTorBox: isPaid,
  };
}

/**
 * Non-hook version for use outside React components (stores, services).
 * Reads subscription status directly from the store.
 */
export function getFeatureGate() {
  const subscription = useSubscriptionStore.getState().subscription;
  const tier = deriveTier(subscription?.status);
  const isPaid = tier === "FlowVid_plus";

  return {
    tier,
    isPaid,
    canUseProfiles: isPaid,
    canUseNativeScrapers: isPaid,
    hasManagedTorBox: isPaid,
  };
}
