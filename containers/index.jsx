// containers/pre-sale/index.jsx
// Presale Purchase UI — Progress bar, countdown, buy form, vesting panel
// Wired to PresaleVault via usePresale hook

"use client";

import { useState, useMemo } from "react";
import { ethers } from "ethers";
import { useWeb3React } from "@web3-react/core";
import { usePresale, formatVTX, ROUND_NAMES } from "../../hooks/usePresale";
import BuyWidget from "../../components/presale/BuyWidget";

// ─── Countdown formatter ────────────────────────────────────────────────────

function formatCountdown(seconds) {
  const s = Number(seconds);
  if (s <= 0) return { d: "00", h: "00", m: "00", s: "00" };
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { d: pad(d), h: pad(h), m: pad(m), s: pad(sec) };
}

// ─── Progress bar ───────────────────────────────────────────────────────────

function RaiseProgress({ totalRaised, hardcap, pct }) {
  return (
    <div className="raise-progress">
      <div className="raise-progress__labels">
        <span className="raised-label">
          {ethers.formatEther(totalRaised || 0n)} ETH raised
        </span>
        <span className="pct-label">{pct.toFixed(1)}%</span>
        <span className="hardcap-label">
          {ethers.formatEther(hardcap || 0n)} ETH goal
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {[25, 50, 75].map((mark) => (
          <div
            key={mark}
            className="progress-mark"
            style={{ left: `${mark}%` }}
          />
        ))}
      </div>
      <div className="round-ticks">
        {ROUND_NAMES.map((name, i) => (
          <span key={i} className="round-tick">{name}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Countdown block ────────────────────────────────────────────────────────

function Countdown({ timeLeft, saleOpen }) {
  const { d, h, m, s } = formatCountdown(timeLeft);

  if (!saleOpen)
    return (
      <div className="countdown countdown--idle">
        <p className="countdown__title">Next round starting soon</p>
      </div>
    );

  return (
    <div className="countdown">
      <p className="countdown__title">Round closes in</p>
      <div className="countdown__segments">
        {[
          { value: d, label: "Days" },
          { value: h, label: "Hours" },
          { value: m, label: "Mins" },
          { value: s, label: "Secs" },
        ].map(({ value, label }) => (
          <div key={label} className="countdown__seg">
            <span className="seg-value">{value}</span>
            <span className="seg-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vesting panel ──────────────────────────────────────────────────────────

function VestingPanel({ vesting, claimable, txPending, txHash, error, onClaim }) {
  if (!vesting || vesting.totalTokens === 0n) {
    return (
      <div className="vesting-panel vesting-panel--empty">
        <div className="vesting-icon">🔒</div>
        <p>Purchase tokens to see your vesting schedule</p>
      </div>
    );
  }

  const total    = vesting.totalTokens;
  const claimed  = vesting.claimedTokens;
  const locked   = total - claimed;
  const vestPct  = total > 0n
    ? Number((claimed * 10000n) / total) / 100
    : 0;

  const vestStart   = new Date(Number(vesting.vestStart) * 1000);
  const vestEnd     = new Date(
    Number(vesting.vestStart + vesting.vestDuration) * 1000
  );

  return (
    <div className="vesting-panel">
      <h3 className="vesting-panel__title">Your Vesting Schedule</h3>

      {/* Token breakdown */}
      <div className="vesting-stats">
        <div className="vstat">
          <span className="vstat__label">Total Allocation</span>
          <span className="vstat__value">{formatVTX(total)} VTX</span>
        </div>
        <div className="vstat">
          <span className="vstat__label">Claimed</span>
          <span className="vstat__value vstat__value--green">
            {formatVTX(claimed)} VTX
          </span>
        </div>
        <div className="vstat">
          <span className="vstat__label">Locked</span>
          <span className="vstat__value vstat__value--amber">
            {formatVTX(locked)} VTX
          </span>
        </div>
        <div className="vstat">
          <span className="vstat__label">Claimable Now</span>
          <span className="vstat__value vstat__value--blue">
            {formatVTX(claimable)} VTX
          </span>
        </div>
      </div>

      {/* Vesting progress bar */}
      <div className="vesting-bar-wrap">
        <div className="vesting-bar">
          <div
            className="vesting-bar__fill"
            style={{ width: `${vestPct}%` }}
          />
        </div>
        <div className="vesting-bar__labels">
          <span>{vestPct.toFixed(1)}% unlocked</span>
          <span>{(100 - vestPct).toFixed(1)}% locked</span>
        </div>
      </div>

      {/* Dates */}
      <div className="vesting-dates">
        <div>
          <span className="date-label">Vesting start</span>
          <span className="date-value">{vestStart.toLocaleDateString()}</span>
        </div>
        <div>
          <span className="date-label">Fully unlocked</span>
          <span className="date-value">{vestEnd.toLocaleDateString()}</span>
        </div>
      </div>

      {/* Error */}
      {error && <div className="vesting-panel__error">⚠ {error}</div>}

      {/* Tx link */}
      {txHash && (
        <div className="vesting-panel__tx">
          <a
            href={`https://goerli.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction ↗
          </a>
        </div>
      )}

      {/* Claim button */}
      <button
        className={`claim-btn${txPending ? " claim-btn--loading" : ""}`}
        onClick={onClaim}
        disabled={txPending || claimable === 0n}
      >
        {txPending
          ? "Claiming…"
          : claimable > 0n
          ? `Claim ${formatVTX(claimable)} VTX`
          : "Nothing to claim yet"}
      </button>
    </div>
  );
}

// ─── Round selector tabs ─────────────────────────────────────────────────────

function RoundTabs({ rounds, activeRound, saleOpen }) {
  return (
    <div className="round-tabs">
      {ROUND_NAMES.map((name, i) => {
        const r       = rounds[i];
        const isActive  = saleOpen && activeRound === i;
        const isDone    = r?.finalized;
        const isPending = !isActive && !isDone;

        return (
          <div
            key={i}
            className={[
              "round-tab",
              isActive  ? "round-tab--active"  : "",
              isDone    ? "round-tab--done"    : "",
              isPending ? "round-tab--pending" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="round-tab__name">{name}</span>
            <span className="round-tab__status">
              {isActive ? "● LIVE" : isDone ? "✓ Done" : "○ Soon"}
            </span>
            {r && (
              <span className="round-tab__raised">
                {Number(ethers.formatEther(r.totalRaised || 0n)).toFixed(1)}/
                {Number(ethers.formatEther(r.hardcap || 0n)).toFixed(0)} ETH
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Connect wallet prompt ───────────────────────────────────────────────────

function ConnectPrompt({ onConnect }) {
  return (
    <div className="connect-prompt">
      <div className="connect-prompt__icon">🔗</div>
      <h3>Connect your wallet to participate</h3>
      <p>Supports MetaMask, WalletConnect, Coinbase Wallet</p>
      <button className="connect-btn" onClick={onConnect}>
        Connect Wallet
      </button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PresalePage() {
  const { activate } = useWeb3React();

  const {
    isActive,
    account,
    chainId,
    saleOpen,
    activeRound,
    rounds,
    currentRound,
    timeLeft,
    totalRaised,
    hardcap,
    progressPct,
    vesting,
    claimable,
    walletContrib,
    estimateTokens,
    buyTokens,
    claimVested,
    loading,
    txPending,
    txHash,
    error,
  } = usePresale();

  const [activeTab, setActiveTab] = useState("buy"); // "buy" | "vesting"

  // Connect wallet handler — wire to your preferred connector
  const handleConnect = () => {
    // Example: inject connector from @web3-react/injected-connector
    // activate(injectedConnector);
    window.alert("Wire activate() to your Web3React connector setup");
  };

  if (loading) {
    return (
      <div className="presale-loading">
        <div className="spinner" />
        <p>Loading presale data…</p>
      </div>
    );
  }

  return (
    <div className="presale-page">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <header className="presale-hero">
        <div className="presale-hero__tag">🚀 VaultX Token Sale</div>
        <h1 className="presale-hero__title">
          Secure Your <span className="gradient-text">$VTX</span> Allocation
        </h1>
        <p className="presale-hero__sub">
          Three-tier presale · Merkle whitelist · Linear vesting · ETH & BNB
        </p>
      </header>

      {/* ── Round tabs ────────────────────────────────────────────── */}
      <RoundTabs
        rounds={rounds}
        activeRound={activeRound}
        saleOpen={saleOpen}
      />

      {/* ── Raise progress ────────────────────────────────────────── */}
      <RaiseProgress
        totalRaised={totalRaised}
        hardcap={hardcap}
        pct={progressPct}
      />

      {/* ── Countdown ─────────────────────────────────────────────── */}
      <Countdown timeLeft={timeLeft} saleOpen={saleOpen} />

      {/* ── Main panel ────────────────────────────────────────────── */}
      <div className="presale-panel">
        {!isActive ? (
          <ConnectPrompt onConnect={handleConnect} />
        ) : (
          <>
            {/* Tab switcher */}
            <div className="panel-tabs">
              <button
                className={`panel-tab${activeTab === "buy" ? " panel-tab--active" : ""}`}
                onClick={() => setActiveTab("buy")}
              >
                Buy Tokens
              </button>
              <button
                className={`panel-tab${activeTab === "vesting" ? " panel-tab--active" : ""}`}
                onClick={() => setActiveTab("vesting")}
              >
                Vesting
                {claimable > 0n && (
                  <span className="badge">
                    {formatVTX(claimable)}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "buy" ? (
              <BuyWidget
                currentRound={currentRound}
                activeRound={activeRound}
                saleOpen={saleOpen}
                account={account}
                chainId={chainId}
                estimateTokens={estimateTokens}
                walletContrib={walletContrib}
                txPending={txPending}
                txHash={txHash}
                error={error}
                onBuy={buyTokens}
              />
            ) : (
              <VestingPanel
                vesting={vesting}
                claimable={claimable}
                txPending={txPending}
                txHash={txHash}
                error={error}
                onClaim={claimVested}
              />
            )}
          </>
        )}
      </div>

      {/* ── Info grid ─────────────────────────────────────────────── */}
      <div className="presale-info-grid">
        <InfoCard
          icon="💎"
          title="Tiered Rounds"
          body="Pre-Seed → Seed → Public with increasing price and expanding whitelist"
        />
        <InfoCard
          icon="🛡"
          title="Merkle Whitelist"
          body="Private rounds use Merkle proof verification — only approved wallets qualify"
        />
        <InfoCard
          icon="⏳"
          title="Linear Vesting"
          body="180-day linear vesting from purchase date. Claim proportionally anytime."
        />
        <InfoCard
          icon="⛓"
          title="Multi-Network"
          body="Participate on Ethereum or Binance Smart Chain — same contract, same price"
        />
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

function InfoCard({ icon, title, body }) {
  return (
    <div className="info-card">
      <div className="info-card__icon">{icon}</div>
      <h4 className="info-card__title">{title}</h4>
      <p className="info-card__body">{body}</p>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --bg:        #080c14;
    --surface:   #0e1624;
    --border:    rgba(255,255,255,0.08);
    --text:      #e8edf5;
    --muted:     #6b7a99;
    --accent:    #3b82f6;
    --accent2:   #8b5cf6;
    --green:     #22d3a3;
    --amber:     #f59e0b;
    --red:       #ef4444;
    --radius:    12px;
    --mono:      'Space Mono', monospace;
    --sans:      'DM Sans', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .presale-page {
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
    max-width: 860px;
    margin: 0 auto;
  }

  /* ── Loading ── */
  .presale-loading {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 60vh; gap: 1rem; color: var(--muted);
  }
  .spinner {
    width: 40px; height: 40px; border: 3px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Hero ── */
  .presale-hero { text-align: center; margin-bottom: 2.5rem; }
  .presale-hero__tag {
    display: inline-block; background: rgba(59,130,246,0.12);
    border: 1px solid rgba(59,130,246,0.3); color: var(--accent);
    font-size: 0.8rem; font-family: var(--mono); letter-spacing: 0.05em;
    padding: 0.35rem 0.9rem; border-radius: 999px; margin-bottom: 1rem;
  }
  .presale-hero__title {
    font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 600; line-height: 1.15;
    margin-bottom: 0.75rem;
  }
  .gradient-text {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .presale-hero__sub { color: var(--muted); font-size: 1rem; }

  /* ── Round tabs ── */
  .round-tabs {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .round-tab {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 0.85rem 1rem;
    display: flex; flex-direction: column; gap: 0.25rem;
    transition: border-color 0.2s;
  }
  .round-tab--active { border-color: var(--accent); }
  .round-tab--done   { opacity: 0.55; }
  .round-tab__name   { font-size: 0.85rem; font-weight: 500; }
  .round-tab__status { font-size: 0.7rem; font-family: var(--mono); color: var(--muted); }
  .round-tab--active .round-tab__status { color: var(--green); }
  .round-tab__raised { font-size: 0.75rem; color: var(--muted); }

  /* ── Raise progress ── */
  .raise-progress { margin-bottom: 1.5rem; }
  .raise-progress__labels {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 0.85rem; margin-bottom: 0.6rem;
  }
  .raised-label  { color: var(--text); font-family: var(--mono); }
  .pct-label     { color: var(--accent); font-weight: 600; font-family: var(--mono); }
  .hardcap-label { color: var(--muted); }
  .progress-track {
    height: 8px; background: rgba(255,255,255,0.05); border-radius: 999px;
    position: relative; overflow: visible; margin-bottom: 0.5rem;
  }
  .progress-fill {
    height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 999px; transition: width 0.6s ease;
  }
  .progress-mark {
    position: absolute; top: -2px; width: 1px; height: 12px;
    background: rgba(255,255,255,0.15); transform: translateX(-50%);
  }
  .round-ticks {
    display: flex; justify-content: space-between;
    font-size: 0.7rem; color: var(--muted); padding: 0 0.25rem;
  }

  /* ── Countdown ── */
  .countdown {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.5rem; text-align: center;
    margin-bottom: 1.5rem;
  }
  .countdown__title { font-size: 0.8rem; color: var(--muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.1em; }
  .countdown__segments { display: flex; gap: 1.5rem; justify-content: center; }
  .countdown__seg { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
  .seg-value { font-family: var(--mono); font-size: 2.2rem; font-weight: 700; color: var(--text); }
  .seg-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }

  /* ── Panel ── */
  .presale-panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.5rem; margin-bottom: 2rem;
  }
  .panel-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .panel-tab {
    flex: 1; background: transparent; border: 1px solid var(--border);
    border-radius: 8px; color: var(--muted); font-size: 0.9rem; padding: 0.6rem;
    cursor: pointer; position: relative; transition: all 0.15s;
    font-family: var(--sans);
  }
  .panel-tab--active {
    background: rgba(59,130,246,0.12); border-color: var(--accent); color: var(--text);
  }
  .badge {
    display: inline-block; background: var(--accent); color: white;
    font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 999px;
    margin-left: 0.4rem; vertical-align: middle; font-family: var(--mono);
  }

  /* ── Connect prompt ── */
  .connect-prompt {
    text-align: center; padding: 2rem; display: flex;
    flex-direction: column; align-items: center; gap: 0.75rem;
  }
  .connect-prompt__icon { font-size: 2.5rem; }
  .connect-prompt h3  { font-size: 1.1rem; }
  .connect-prompt p   { color: var(--muted); font-size: 0.9rem; }
  .connect-btn {
    margin-top: 0.5rem; background: var(--accent); color: white;
    border: none; border-radius: 8px; padding: 0.75rem 2rem;
    font-size: 1rem; cursor: pointer; font-family: var(--sans);
    transition: opacity 0.15s;
  }
  .connect-btn:hover { opacity: 0.85; }

  /* ── Buy widget ── */
  .buy-widget { display: flex; flex-direction: column; gap: 1rem; }
  .buy-widget--closed { text-align: center; padding: 1.5rem; color: var(--muted); }
  .buy-widget__header { display: flex; justify-content: space-between; align-items: center; }
  .round-badge {
    font-size: 0.75rem; font-family: var(--mono);
    background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3);
    color: var(--accent2); padding: 0.25rem 0.7rem; border-radius: 999px;
  }
  .price-label { font-size: 0.85rem; color: var(--muted); }
  .price-label strong { color: var(--text); }
  .input-label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.4rem; }
  .input-row { display: flex; gap: 0.5rem; }
  .token-input {
    flex: 1; background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 1.1rem;
    padding: 0.65rem 0.9rem; font-family: var(--mono);
    transition: border-color 0.15s; outline: none;
  }
  .token-input:focus { border-color: var(--accent); }
  .token-input::-webkit-inner-spin-button { display: none; }
  .max-btn {
    background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.3);
    color: var(--accent); border-radius: 8px; padding: 0 1rem;
    cursor: pointer; font-size: 0.8rem; font-family: var(--mono);
    transition: background 0.15s;
  }
  .max-btn:hover { background: rgba(59,130,246,0.22); }
  .quick-select { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .quick-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 6px; color: var(--muted); font-size: 0.8rem;
    padding: 0.3rem 0.65rem; cursor: pointer; font-family: var(--mono);
    transition: all 0.15s;
  }
  .quick-btn:hover, .quick-btn--active {
    background: rgba(59,130,246,0.1); border-color: var(--accent); color: var(--accent);
  }
  .buy-widget__estimate {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(34,211,163,0.08); border: 1px solid rgba(34,211,163,0.2);
    border-radius: 8px; padding: 0.75rem 1rem;
  }
  .estimate-label { font-size: 0.8rem; color: var(--muted); }
  .estimate-value { font-family: var(--mono); color: var(--green); font-size: 1rem; }
  .buy-widget__limits { display: flex; flex-direction: column; gap: 0.35rem; }
  .limit-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--muted); }
  .buy-widget__error, .vesting-panel__error {
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px; padding: 0.6rem 0.9rem; font-size: 0.85rem; color: #fca5a5;
  }
  .buy-widget__tx, .vesting-panel__tx { font-size: 0.8rem; }
  .buy-widget__tx a, .vesting-panel__tx a { color: var(--accent); text-decoration: none; }
  .buy-btn, .claim-btn {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border: none; border-radius: 10px; color: white; font-size: 1rem;
    padding: 0.85rem; cursor: pointer; font-family: var(--sans); font-weight: 500;
    transition: opacity 0.15s; width: 100%;
  }
  .buy-btn:disabled, .claim-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .buy-btn--loading, .claim-btn--loading { opacity: 0.7; cursor: wait; }
  .whitelist-note { font-size: 0.75rem; color: var(--muted); text-align: center; }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
  .status-dot--inactive { background: var(--muted); }

  /* ── Vesting panel ── */
  .vesting-panel { display: flex; flex-direction: column; gap: 1rem; }
  .vesting-panel--empty { text-align: center; padding: 2rem; color: var(--muted); }
  .vesting-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
  .vesting-panel__title { font-size: 1rem; font-weight: 600; }
  .vesting-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .vstat { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; }
  .vstat__label { display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 0.25rem; }
  .vstat__value { font-family: var(--mono); font-size: 0.95rem; }
  .vstat__value--green { color: var(--green); }
  .vstat__value--amber { color: var(--amber); }
  .vstat__value--blue  { color: var(--accent); }
  .vesting-bar-wrap { display: flex; flex-direction: column; gap: 0.4rem; }
  .vesting-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; }
  .vesting-bar__fill { height: 100%; background: linear-gradient(90deg, var(--green), var(--accent)); border-radius: 999px; transition: width 0.6s; }
  .vesting-bar__labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--muted); }
  .vesting-dates { display: flex; justify-content: space-between; }
  .date-label { display: block; font-size: 0.7rem; color: var(--muted); }
  .date-value { font-size: 0.85rem; font-family: var(--mono); }

  /* ── Info grid ── */
  .presale-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .info-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem;
  }
  .info-card__icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .info-card__title { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.35rem; }
  .info-card__body { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .round-tabs { grid-template-columns: 1fr; }
    .presale-info-grid { grid-template-columns: 1fr; }
    .vesting-stats { grid-template-columns: 1fr; }
    .countdown__segments { gap: 0.75rem; }
    .seg-value { font-size: 1.6rem; }
  }
`;
