/**
 * FlowVid Upgrade Prompt
 *
 * A reusable modal shown when free users try to access FlowVid+ features.
 * Shows feature-specific messaging and a Subscribe CTA.
 */

import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  GatedFeature,
  getFeatureInfo,
  getAllGatedFeatures,
} from "../hooks/useFeatureGate";
import { useAuthStore } from "../stores/authStore";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { X, Users, Search, Bolt } from "./Icons";
import "./UpgradePrompt.css";

interface UpgradePromptProps {
  /** Which feature triggered the prompt */
  feature: GatedFeature;
  /** Called when user dismisses the prompt */
  onClose: () => void;
}

const FEATURE_ICONS: Record<GatedFeature, React.ReactNode> = {
  family_profiles: <Users size={20} />,
  native_scrapers: <Search size={20} />,
  managed_torbox: <Bolt size={20} />,
};

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  feature,
  onClose,
}) => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const startCheckout = useSubscriptionStore((s) => s.startCheckout);
  const checkoutLoading = useSubscriptionStore((s) => s.checkoutLoading);
  const featureInfo = getFeatureInfo(feature);
  const allFeatures = getAllGatedFeatures();

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate("/login");
      return;
    }
    const url = await startCheckout();
    if (url) {
      window.open(url, "_blank");
      onClose();
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-close" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="upgrade-header">
          <span className="upgrade-badge">FlowVid+</span>
          <h2 className="upgrade-title">Unlock {featureInfo.title}</h2>
          <p className="upgrade-description">{featureInfo.description}</p>
        </div>

        <div className="upgrade-features">
          <h3 className="upgrade-features-title">Everything in FlowVid+</h3>
          {allFeatures.map((f) => (
            <div
              key={f.key}
              className={`upgrade-feature-row ${f.key === feature ? "upgrade-feature-row--highlighted" : ""}`}
            >
              <span className="upgrade-feature-icon">
                {FEATURE_ICONS[f.key]}
              </span>
              <div className="upgrade-feature-text">
                <strong>{f.title}</strong>
                <span>{f.description}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="upgrade-actions">
          <button
            className="upgrade-subscribe-btn"
            onClick={handleSubscribe}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? "Loading..." : "Subscribe to FlowVid+"}
          </button>
          <button className="upgrade-dismiss-btn" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradePrompt;
