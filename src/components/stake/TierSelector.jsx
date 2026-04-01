// components/stake/TierSelector.jsx
// Visual tier picker — 30d / 90d / 180d with live APY badges

import { TIER_META } from "../../hooks/useStaking";

export default function TierSelector({
  selected,
  onSelect,
  effectiveApys = [],
  disabled = false,
}) {
  return (
    <div className="tier-selector">
      {TIER_META.map((tier) => {
        const apyBps = effectiveApys[tier.id] ?? 0n;
        const apyPct = Number(apyBps) / 100; // bps → percent
        const isSelected = selected === tier.id;

        return (
          <button
            key={tier.id}
            className={[
              "tier-card",
              isSelected ? "tier-card--selected" : "",
              disabled   ? "tier-card--disabled"  : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ "--tier-color": tier.color }}
            onClick={() => !disabled && onSelect(tier.id)}
            disabled={disabled}
            aria-pressed={isSelected}
          >
            {/* Selection indicator */}
            <div className="tier-card__check">
              {isSelected ? "✓" : ""}
            </div>

            {/* Duration badge */}
            <div className="tier-card__duration">{tier.label}</div>

            {/* Multiplier */}
            <div className="tier-card__multiplier">
              <span className="mult-value">{tier.multiplier}</span>
              <span className="mult-label">APY multiplier</span>
            </div>

            {/* Live APY */}
            <div className="tier-card__apy">
              <span className="apy-value">{apyPct.toFixed(1)}%</span>
              <span className="apy-label">APY</span>
            </div>

            {/* Lock description */}
            <div className="tier-card__desc">
              {tier.days}-day lock · {tier.multiplier} base rewards
            </div>

            {/* Early exit warning */}
            <div className="tier-card__penalty">
              10% penalty on early exit
            </div>
          </button>
        );
      })}
    </div>
  );
}
