// components/presale/BuyWidget.jsx
// ETH ↔ BNB toggle buy form with estimated VTX output, progress bar, and error handling

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { formatVTX } from "../../hooks/usePresale";

// ── Merkle proof fetch (from your backend / whitelist API) ──────────────────
async function fetchMerkleProof(account, roundIndex) {
  try {
    const res = await fetch(
      `/api/whitelist/proof?address=${account}&round=${roundIndex}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.proof ?? [];
  } catch {
    return [];
  }
}

// ── Currency labels ─────────────────────────────────────────────────────────
const CURRENCY_BY_CHAIN = {
  1    : "ETH",
  5    : "ETH",
  56   : "BNB",
  97   : "BNB",
  31337: "ETH",
};

export default function BuyWidget({
  currentRound,
  activeRound,
  saleOpen,
  account,
  chainId,
  estimateTokens,
  walletContrib,
  txPending,
  txHash,
  error,
  onBuy,
}) {
  const [amount, setAmount]     = useState("");
  const [localErr, setLocalErr] = useState("");

  const currency    = CURRENCY_BY_CHAIN[chainId] ?? "ETH";
  const isWhitelist = currentRound?.whitelistRequired ?? false;

  // Derived
  const estimated    = amount ? estimateTokens(amount) : 0n;
  const minBuy       = currentRound ? ethers.formatEther(currentRound.minBuy) : "0";
  const maxBuy       = currentRound ? ethers.formatEther(currentRound.maxBuy) : "0";
  const contributed  = walletContrib ? ethers.formatEther(walletContrib) : "0";
  const remaining    = currentRound
    ? ethers.formatEther(currentRound.maxBuy - (walletContrib ?? 0n))
    : "0";

  const validateAndBuy = useCallback(async () => {
    setLocalErr("");

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setLocalErr("Enter a valid amount");
      return;
    }
    if (Number(amount) < Number(minBuy)) {
      setLocalErr(`Minimum buy is ${minBuy} ${currency}`);
      return;
    }
    if (Number(amount) > Number(remaining)) {
      setLocalErr(`Maximum remaining is ${remaining} ${currency}`);
      return;
    }

    let proof = [];
    if (isWhitelist) {
      proof = await fetchMerkleProof(account, activeRound);
      if (!proof.length) {
        setLocalErr("Your wallet is not whitelisted for this round");
        return;
      }
    }

    onBuy(amount, proof);
  }, [amount, minBuy, remaining, currency, isWhitelist, account, activeRound, onBuy]);

  if (!saleOpen) {
    return (
      <div className="buy-widget buy-widget--closed">
        <div className="buy-widget__status">
          <span className="status-dot status-dot--inactive" />
          <span>Sale not active</span>
        </div>
      </div>
    );
  }

  return (
    <div className="buy-widget">
      {/* Header */}
      <div className="buy-widget__header">
        <div className="round-badge">
          {isWhitelist ? "🔒 Private" : "🌐 Public"} Round
        </div>
        <div className="price-label">
          1 VTX ={" "}
          <strong>
            {currentRound
              ? ethers.formatEther(currentRound.pricePerToken)
              : "—"}{" "}
            {currency}
          </strong>
        </div>
      </div>

      {/* Amount input */}
      <div className="buy-widget__input-group">
        <label className="input-label">Amount ({currency})</label>
        <div className="input-row">
          <input
            type="number"
            className="token-input"
            placeholder={`Min ${minBuy}`}
            value={amount}
            min={minBuy}
            max={remaining}
            step="0.001"
            onChange={(e) => {
              setLocalErr("");
              setAmount(e.target.value);
            }}
            disabled={txPending}
          />
          <button
            className="max-btn"
            onClick={() => setAmount(remaining)}
            disabled={txPending || Number(remaining) <= 0}
          >
            MAX
          </button>
        </div>

        {/* Quick select buttons */}
        <div className="quick-select">
          {["0.1", "0.5", "1", "2"].map((v) => (
            <button
              key={v}
              className={`quick-btn${amount === v ? " quick-btn--active" : ""}`}
              onClick={() => { setLocalErr(""); setAmount(v); }}
              disabled={txPending}
            >
              {v} {currency}
            </button>
          ))}
        </div>
      </div>

      {/* Estimated output */}
      {estimated > 0n && (
        <div className="buy-widget__estimate">
          <span className="estimate-label">You receive</span>
          <span className="estimate-value">
            ≈ {formatVTX(estimated)} VTX
          </span>
        </div>
      )}

      {/* Wallet limits */}
      <div className="buy-widget__limits">
        <div className="limit-row">
          <span>Your contribution</span>
          <span>{contributed} / {maxBuy} {currency}</span>
        </div>
        <div className="limit-row">
          <span>Remaining allowance</span>
          <span>{remaining} {currency}</span>
        </div>
      </div>

      {/* Error display */}
      {(localErr || error) && (
        <div className="buy-widget__error">
          ⚠ {localErr || error}
        </div>
      )}

      {/* Tx hash */}
      {txHash && (
        <div className="buy-widget__tx">
          <a
            href={`https://goerli.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction ↗
          </a>
        </div>
      )}

      {/* CTA */}
      <button
        className={`buy-btn${txPending ? " buy-btn--loading" : ""}`}
        onClick={validateAndBuy}
        disabled={txPending || !account}
      >
        {!account
          ? "Connect Wallet"
          : txPending
          ? "Confirming…"
          : `Buy VTX with ${currency}`}
      </button>

      {isWhitelist && (
        <p className="whitelist-note">
          🔑 Whitelist required · Merkle proof fetched automatically
        </p>
      )}
    </div>
  );
}
