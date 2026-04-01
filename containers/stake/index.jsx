// containers/stake/index.jsx
// VaultX Staking Page — tier selector, amount input, positions table, rewards claim
// Wired to VaultXStaking via useStaking hook

"use client";

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWeb3React } from "@web3-react/core";
import { useStaking, TIER_META } from "../../src/hooks/useStaking";
import TierSelector from "../../src/components/stake/TierSelector";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtVTX(wei) {
  if (!wei) return "0";
  return Number(ethers.formatEther(wei)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function fmtDate(date) {
  return date?.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }) ?? "—";
}

function timeUntil(date) {
  const ms   = date - Date.now();
  if (ms <= 0) return "Unlocked";
  const d    = Math.floor(ms / 86400000);
  const h    = Math.floor((ms % 86400000) / 3600000);
  if (d > 0)  return `${d}d ${h}h remaining`;
  return `${h}h remaining`;
}

// ─── APY display ─────────────────────────────────────────────────────────────

function ApyBadge({ bps, color }) {
  const pct = (Number(bps) / 100).toFixed(1);
  return (
    <span className="apy-badge" style={{ "--c": color }}>
      {pct}% APY
    </span>
  );
}

// ─── Stake form ───────────────────────────────────────────────────────────────

function StakeForm({ tokenBalance, tierConfigs, effectiveApys, onStake, txPending, error }) {
  const [selectedTier, setSelectedTier] = useState(1); // default: 90d
  const [amount, setAmount]             = useState("");
  const [localErr, setLocalErr]         = useState("");

  const tier    = TIER_META[selectedTier];
  const config  = tierConfigs[selectedTier];
  const apyBps  = effectiveApys[selectedTier] ?? 0n;

  const minStake = config
    ? Number(ethers.formatEther(config.minStake)).toFixed(0)
    : "100";

  const handleStake = useCallback(() => {
    setLocalErr("");
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setLocalErr("Enter a valid amount");
      return;
    }
    if (Number(amount) < Number(minStake)) {
      setLocalErr(`Minimum stake is ${minStake} VTX`);
      return;
    }
    const amountWei = ethers.parseEther(amount);
    if (amountWei > tokenBalance) {
      setLocalErr("Insufficient VTX balance");
      return;
    }
    onStake(amount, selectedTier);
  }, [amount, minStake, tokenBalance, selectedTier, onStake]);

  return (
    <div className="stake-form">
      <h3 className="section-title">Stake VTX</h3>

      {/* Balance display */}
      <div className="balance-row">
        <span className="balance-label">Your balance</span>
        <span className="balance-value">{fmtVTX(tokenBalance)} VTX</span>
      </div>

      {/* Tier selector */}
      <TierSelector
        selected={selectedTier}
        onSelect={setSelectedTier}
        effectiveApys={effectiveApys}
        disabled={txPending}
      />

      {/* Tier summary */}
      {tier && (
        <div className="tier-summary">
          <div className="tier-summary__item">
            <span>Lock period</span>
            <strong>{tier.days} days</strong>
          </div>
          <div className="tier-summary__item">
            <span>Multiplier</span>
            <strong style={{ color: tier.color }}>{tier.multiplier}</strong>
          </div>
          <div className="tier-summary__item">
            <span>Effective APY</span>
            <strong><ApyBadge bps={apyBps} color={tier.color} /></strong>
          </div>
          <div className="tier-summary__item">
            <span>Early exit penalty</span>
            <strong className="penalty">10% to treasury</strong>
          </div>
        </div>
      )}

      {/* Amount input */}
      <div className="stake-input-group">
        <label className="input-label">Amount (VTX)</label>
        <div className="input-row">
          <input
            type="number"
            className="token-input"
            placeholder={`Min ${minStake} VTX`}
            value={amount}
            min={minStake}
            step="10"
            onChange={(e) => { setLocalErr(""); setAmount(e.target.value); }}
            disabled={txPending}
          />
          <button
            className="max-btn"
            onClick={() => setAmount(ethers.formatEther(tokenBalance))}
            disabled={txPending || !tokenBalance}
          >
            MAX
          </button>
        </div>

        <div className="quick-select">
          {["100", "500", "1000", "5000"].map((v) => (
            <button
              key={v}
              className={`quick-btn${amount === v ? " quick-btn--active" : ""}`}
              onClick={() => { setLocalErr(""); setAmount(v); }}
              disabled={txPending}
            >
              {v} VTX
            </button>
          ))}
        </div>
      </div>

      {/* Projected rewards */}
      {amount && Number(amount) > 0 && (
        <div className="projected-rewards">
          <span className="pr-label">Projected annual rewards</span>
          <span className="pr-value">
            ≈{" "}
            {(Number(amount) * Number(apyBps) / 10000).toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}{" "}
            VTX
          </span>
        </div>
      )}

      {/* Errors */}
      {(localErr || error) && (
        <div className="form-error">⚠ {localErr || error}</div>
      )}

      {/* CTA */}
      <button
        className={`stake-btn${txPending ? " stake-btn--loading" : ""}`}
        onClick={handleStake}
        disabled={txPending}
      >
        {txPending ? "Confirming…" : `Stake VTX — ${tier?.label ?? ""}`}
      </button>

      <p className="stake-disclaimer">
        Staking locks your tokens. Early unstake incurs a 10% penalty routed to the treasury.
        Rewards are minted per block and claimed on unstake or manually.
      </p>
    </div>
  );
}

// ─── Position row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, onClaim, onUnstake, txPending }) {
  const tier     = pos.tierMeta;
  const pending  = pos.pendingRewards;

  return (
    <div className="position-row">
      {/* Tier badge */}
      <div className="pos-tier" style={{ "--c": tier.color }}>
        <span className="pos-tier__label">{tier.label}</span>
        <span className="pos-tier__mult">{tier.multiplier}</span>
      </div>

      {/* Amount */}
      <div className="pos-col">
        <span className="pos-col__label">Staked</span>
        <span className="pos-col__value">{fmtVTX(pos.amount)} VTX</span>
      </div>

      {/* Pending rewards */}
      <div className="pos-col">
        <span className="pos-col__label">Pending rewards</span>
        <span className="pos-col__value pos-col__value--green">
          {fmtVTX(pending)} VTX
        </span>
      </div>

      {/* Lock status */}
      <div className="pos-col">
        <span className="pos-col__label">Lock status</span>
        <span className={`pos-col__value${pos.isLocked ? " pos-col__value--amber" : " pos-col__value--green"}`}>
          {pos.isLocked ? timeUntil(pos.lockUntilDate) : "Unlocked ✓"}
        </span>
      </div>

      {/* Unlock date */}
      <div className="pos-col pos-col--date">
        <span className="pos-col__label">Unlock date</span>
        <span className="pos-col__value">{fmtDate(pos.lockUntilDate)}</span>
      </div>

      {/* Actions */}
      <div className="pos-actions">
        <button
          className="claim-rewards-btn"
          onClick={() => onClaim(pos.id)}
          disabled={txPending || pending === 0n}
        >
          {pending > 0n ? `Claim ${fmtVTX(pending)}` : "No rewards"}
        </button>
        <button
          className={`unstake-btn${pos.isLocked ? " unstake-btn--warn" : ""}`}
          onClick={() => onUnstake(pos.id)}
          disabled={txPending}
          title={pos.isLocked ? "Early exit: 10% penalty applies" : "Unstake position"}
        >
          {pos.isLocked ? "⚠ Unstake" : "Unstake"}
        </button>
      </div>
    </div>
  );
}

// ─── Positions table ──────────────────────────────────────────────────────────

function PositionsTable({ positions, totalPending, onClaim, onClaimAll, onUnstake, txPending, txHash }) {
  if (!positions.length) {
    return (
      <div className="no-positions">
        <div className="no-positions__icon">📭</div>
        <p>No active positions</p>
        <span>Stake VTX to start earning rewards</span>
      </div>
    );
  }

  return (
    <div className="positions-section">
      <div className="positions-header">
        <h3 className="section-title">Active Positions</h3>
        {totalPending > 0n && (
          <button
            className={`claim-all-btn${txPending ? " claim-all-btn--loading" : ""}`}
            onClick={onClaimAll}
            disabled={txPending}
          >
            {txPending ? "Claiming…" : `Claim All — ${fmtVTX(totalPending)} VTX`}
          </button>
        )}
      </div>

      <div className="positions-list">
        {positions.map((pos) => (
          <PositionRow
            key={pos.id?.toString()}
            pos={pos}
            onClaim={onClaim}
            onUnstake={onUnstake}
            txPending={txPending}
          />
        ))}
      </div>

      {txHash && (
        <div className="tx-link">
          <a
            href={`https://goerli.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View latest transaction ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ totalStaked, enrichedPositions, totalPending }) {
  const myStaked = enrichedPositions.reduce(
    (acc, p) => acc + (p.amount ?? 0n), 0n
  );

  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat__label">Total Protocol Staked</span>
        <span className="stat__value">{fmtVTX(totalStaked)} VTX</span>
      </div>
      <div className="stat">
        <span className="stat__label">My Staked</span>
        <span className="stat__value">{fmtVTX(myStaked)} VTX</span>
      </div>
      <div className="stat">
        <span className="stat__label">My Pending Rewards</span>
        <span className="stat__value stat__value--green">{fmtVTX(totalPending)} VTX</span>
      </div>
      <div className="stat">
        <span className="stat__label">Active Positions</span>
        <span className="stat__value">{enrichedPositions.length}</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StakePage() {
  const stakingData = useStaking();
  const isActive   = stakingData.isActive;
  const account    = stakingData.account;
  // Preview mock data when wallet not connected
  const tierConfigs      = stakingData.tierConfigs.length    ? stakingData.tierConfigs    : [{lockDuration:0,multiplierBps:10000,minStake:0},{lockDuration:0,multiplierBps:15000,minStake:0},{lockDuration:0,multiplierBps:20000,minStake:0}];
  const effectiveApys    = stakingData.effectiveApys.length  ? stakingData.effectiveApys  : [2000n, 3000n, 4000n];
  const totalStaked      = stakingData.totalStaked  || 0n;
  const tokenBalance     = stakingData.tokenBalance || 0n;
  const enrichedPositions = stakingData.enrichedPositions || [];
  const totalPending     = stakingData.totalPending || 0n;
  const { stake, unstake, claimRewards, claimAllRewards, loading, txPending, txHash, error } = stakingData;

  if (loading) {
    return (
      <div className="stake-loading">
        <div className="spinner" />
        <p>Loading staking data…</p>
      </div>
    );
  }

  // Show full UI in preview mode even without wallet

  return (
    <div className="stake-page">
      {/* ── Hero ── */}
      <header className="stake-hero">
        <div className="stake-hero__tag">⚡ VaultX Staking</div>
        <h1 className="stake-hero__title">
          Earn Rewards on Your <span className="gradient-text">$VTX</span>
        </h1>
        <p className="stake-hero__sub">
          Lock tokens · Multiply by tier · Claim per block · 10% early-exit penalty
        </p>
      </header>

      {/* ── Tier APY overview ── */}
      <div className="tier-overview">
        {TIER_META.map((tier, i) => (
          <div key={tier.id} className="tier-overview__card" style={{ "--c": tier.color }}>
            <span className="toc__duration">{tier.label}</span>
            <span className="toc__mult">{tier.multiplier}</span>
            <ApyBadge bps={effectiveApys[i] ?? 0n} color={tier.color} />
          </div>
        ))}
      </div>

      {/* ── Stats bar ── */}
      <StatsBar
        totalStaked={totalStaked}
        enrichedPositions={enrichedPositions}
        totalPending={totalPending}
      />

      {/* ── Main grid ── */}
      <div className="stake-grid">
        {/* Left: Stake form */}
        <div className="stake-grid__form">
          <StakeForm
            tokenBalance={tokenBalance}
            tierConfigs={tierConfigs}
            effectiveApys={effectiveApys}
            onStake={stake}
            txPending={txPending}
            error={error}
          />
        </div>

        {/* Right: Positions */}
        <div className="stake-grid__positions">
          <PositionsTable
            positions={enrichedPositions}
            totalPending={totalPending}
            onClaim={claimRewards}
            onClaimAll={claimAllRewards}
            onUnstake={unstake}
            txPending={txPending}
            txHash={txHash}
          />
        </div>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --bg:      #080c14;
    --surface: #0e1624;
    --border:  rgba(255,255,255,0.07);
    --text:    #e8edf5;
    --muted:   #6b7a99;
    --accent:  #3b82f6;
    --accent2: #8b5cf6;
    --green:   #22d3a3;
    --amber:   #f59e0b;
    --red:     #ef4444;
    --radius:  12px;
    --mono:    'Space Mono', monospace;
    --sans:    'DM Sans', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .stake-page {
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
    max-width: 1080px;
    margin: 0 auto;
  }

  /* ── Loading ── */
  .stake-loading {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 60vh; gap: 1rem; color: var(--muted);
  }
  .spinner {
    width: 40px; height: 40px; border: 3px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Hero ── */
  .stake-hero { text-align: center; margin-bottom: 2rem; }
  .stake-hero__tag {
    display: inline-block; background: rgba(139,92,246,0.12);
    border: 1px solid rgba(139,92,246,0.3); color: var(--accent2);
    font-size: 0.8rem; font-family: var(--mono); letter-spacing: 0.05em;
    padding: 0.35rem 0.9rem; border-radius: 999px; margin-bottom: 1rem;
  }
  .stake-hero__title {
    font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 600; margin-bottom: 0.5rem;
  }
  .gradient-text {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .stake-hero__sub { color: var(--muted); font-size: 0.95rem; }

  /* ── Connect wall ── */
  .connect-wall {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.75rem; padding: 3rem; color: var(--muted);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    text-align: center;
  }
  .connect-wall__icon { font-size: 3rem; }
  .connect-wall h3    { color: var(--text); font-size: 1.1rem; }

  /* ── Tier overview ── */
  .tier-overview {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;
  }
  .tier-overview__card {
    background: var(--surface); border: 1px solid var(--c, var(--border));
    border-radius: var(--radius); padding: 1rem; display: flex;
    flex-direction: column; align-items: center; gap: 0.4rem;
    box-shadow: 0 0 20px rgba(0,0,0,0.2);
  }
  .toc__duration { font-size: 0.75rem; color: var(--muted); font-family: var(--mono); }
  .toc__mult     { font-size: 1.4rem; font-weight: 700; color: var(--c); }

  /* APY badge */
  .apy-badge {
    background: color-mix(in srgb, var(--c) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
    color: var(--c); font-size: 0.8rem; padding: 0.2rem 0.55rem;
    border-radius: 999px; font-family: var(--mono); font-weight: 700;
  }

  /* ── Stats bar ── */
  .stats-bar {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;
    margin-bottom: 2rem;
  }
  .stat {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1rem;
  }
  .stat__label { display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat__value { font-family: var(--mono); font-size: 1rem; }
  .stat__value--green { color: var(--green); }

  /* ── Main grid ── */
  .stake-grid { display: grid; grid-template-columns: 400px 1fr; gap: 1.5rem; align-items: start; }
  .stake-grid__form, .stake-grid__positions {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.5rem;
  }

  /* ── Section title ── */
  .section-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }

  /* ── Balance row ── */
  .balance-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .balance-label { font-size: 0.8rem; color: var(--muted); }
  .balance-value { font-family: var(--mono); font-size: 0.9rem; }

  /* ── Tier selector ── */
  .tier-selector { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .tier-card {
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
    text-align: left; position: relative; transition: border-color 0.15s, background 0.15s;
    font-family: var(--sans); color: var(--text);
    display: grid; grid-template-columns: 24px 1fr 1fr auto; align-items: center; gap: 0.75rem;
  }
  .tier-card--selected { border-color: var(--tier-color); background: color-mix(in srgb, var(--tier-color) 8%, transparent); }
  .tier-card--disabled { opacity: 0.5; cursor: not-allowed; }
  .tier-card__check { width: 20px; height: 20px; border: 2px solid var(--border); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--tier-color); }
  .tier-card--selected .tier-card__check { border-color: var(--tier-color); background: color-mix(in srgb, var(--tier-color) 20%, transparent); }
  .tier-card__duration { font-size: 0.9rem; font-weight: 600; }
  .tier-card__multiplier { display: flex; flex-direction: column; }
  .mult-value { font-size: 1.1rem; font-weight: 700; color: var(--tier-color); font-family: var(--mono); }
  .mult-label { font-size: 0.65rem; color: var(--muted); }
  .tier-card__apy { display: flex; flex-direction: column; align-items: flex-end; }
  .apy-value { font-size: 1rem; font-weight: 700; color: var(--tier-color); font-family: var(--mono); }
  .apy-label { font-size: 0.65rem; color: var(--muted); }
  .tier-card__desc { display: none; }
  .tier-card__penalty { display: none; }

  /* ── Tier summary ── */
  .tier-summary {
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.85rem; display: grid;
    grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; margin-bottom: 1rem;
  }
  .tier-summary__item { display: flex; justify-content: space-between; font-size: 0.8rem; }
  .tier-summary__item span { color: var(--muted); }
  .tier-summary__item strong { font-weight: 500; }
  .penalty { color: var(--amber); }

  /* ── Input group ── */
  .stake-input-group { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .input-label { display: block; font-size: 0.8rem; color: var(--muted); }
  .input-row { display: flex; gap: 0.5rem; }
  .token-input {
    flex: 1; background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 1rem;
    padding: 0.65rem 0.9rem; font-family: var(--mono); outline: none; transition: border-color 0.15s;
  }
  .token-input:focus { border-color: var(--accent); }
  .token-input::-webkit-inner-spin-button { display: none; }
  .max-btn {
    background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.3);
    color: var(--accent); border-radius: 8px; padding: 0 1rem; cursor: pointer;
    font-size: 0.8rem; font-family: var(--mono); transition: background 0.15s;
  }
  .max-btn:hover { background: rgba(59,130,246,0.22); }
  .quick-select { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .quick-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 6px; color: var(--muted); font-size: 0.75rem;
    padding: 0.3rem 0.6rem; cursor: pointer; font-family: var(--mono); transition: all 0.15s;
  }
  .quick-btn:hover, .quick-btn--active { background: rgba(59,130,246,0.1); border-color: var(--accent); color: var(--accent); }

  /* ── Projected rewards ── */
  .projected-rewards {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(34,211,163,0.08); border: 1px solid rgba(34,211,163,0.2);
    border-radius: 8px; padding: 0.6rem 1rem;
  }
  .pr-label { font-size: 0.8rem; color: var(--muted); }
  .pr-value { font-family: var(--mono); color: var(--green); font-size: 0.95rem; }

  /* ── Form error ── */
  .form-error {
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px; padding: 0.6rem 0.9rem; font-size: 0.85rem; color: #fca5a5;
  }

  /* ── Stake button ── */
  .stake-btn {
    width: 100%; background: linear-gradient(135deg, var(--accent2), var(--accent));
    border: none; border-radius: 10px; color: white; font-size: 1rem;
    padding: 0.85rem; cursor: pointer; font-family: var(--sans); font-weight: 500;
    transition: opacity 0.15s;
  }
  .stake-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .stake-btn--loading { opacity: 0.7; cursor: wait; }
  .stake-disclaimer { font-size: 0.72rem; color: var(--muted); line-height: 1.5; margin-top: 0.5rem; }

  /* ── Positions ── */
  .positions-section { display: flex; flex-direction: column; gap: 1rem; }
  .positions-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .claim-all-btn {
    background: rgba(34,211,163,0.12); border: 1px solid rgba(34,211,163,0.3);
    color: var(--green); border-radius: 8px; padding: 0.5rem 0.85rem;
    font-size: 0.8rem; cursor: pointer; font-family: var(--mono); transition: background 0.15s;
  }
  .claim-all-btn:hover  { background: rgba(34,211,163,0.22); }
  .claim-all-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .claim-all-btn--loading { opacity: 0.7; cursor: wait; }

  /* ── No positions ── */
  .no-positions {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    padding: 2.5rem; color: var(--muted); text-align: center;
  }
  .no-positions__icon { font-size: 2.5rem; }
  .no-positions p { color: var(--text); }
  .no-positions span { font-size: 0.85rem; }

  /* ── Position row ── */
  .positions-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .position-row {
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 10px; padding: 1rem; display: grid;
    grid-template-columns: 72px repeat(3, 1fr) auto 140px; gap: 0.75rem; align-items: center;
  }
  .pos-tier {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.2rem; padding: 0.4rem; border-radius: 8px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
  }
  .pos-tier__label { font-size: 0.65rem; color: var(--muted); font-family: var(--mono); }
  .pos-tier__mult  { font-size: 0.9rem; font-weight: 700; color: var(--c); }
  .pos-col { display: flex; flex-direction: column; gap: 0.2rem; }
  .pos-col--date { }
  .pos-col__label { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .pos-col__value { font-size: 0.85rem; font-family: var(--mono); }
  .pos-col__value--green { color: var(--green); }
  .pos-col__value--amber { color: var(--amber); }
  .pos-actions { display: flex; flex-direction: column; gap: 0.4rem; }
  .claim-rewards-btn {
    background: rgba(34,211,163,0.1); border: 1px solid rgba(34,211,163,0.25);
    color: var(--green); border-radius: 6px; padding: 0.4rem 0.6rem;
    font-size: 0.75rem; cursor: pointer; font-family: var(--mono); transition: background 0.15s;
    white-space: nowrap;
  }
  .claim-rewards-btn:hover   { background: rgba(34,211,163,0.2); }
  .claim-rewards-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .unstake-btn {
    background: rgba(255,255,255,0.05); border: 1px solid var(--border);
    color: var(--muted); border-radius: 6px; padding: 0.4rem 0.6rem;
    font-size: 0.75rem; cursor: pointer; font-family: var(--mono); transition: all 0.15s;
  }
  .unstake-btn:hover     { border-color: var(--accent); color: var(--accent); }
  .unstake-btn--warn     { border-color: rgba(245,158,11,0.3); color: var(--amber); }
  .unstake-btn--warn:hover { background: rgba(245,158,11,0.1); }
  .unstake-btn:disabled  { opacity: 0.4; cursor: not-allowed; }
  .tx-link { font-size: 0.8rem; }
  .tx-link a { color: var(--accent); text-decoration: none; }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .stake-grid { grid-template-columns: 1fr; }
    .stats-bar  { grid-template-columns: 1fr 1fr; }
    .position-row { grid-template-columns: 72px 1fr 1fr; }
    .pos-col--date, .positions-list .pos-col:nth-child(4) { display: none; }
  }
  @media (max-width: 600px) {
    .tier-overview { grid-template-columns: 1fr; }
    .stats-bar     { grid-template-columns: 1fr; }
    .position-row  { grid-template-columns: 1fr; }
  }
`;
