// hooks/useStaking.js
// Connects to VaultXStaking via ethers.js + useWeb3React
// Polls positions, pending rewards every ~12 blocks, exposes stake/unstake/claim

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useWeb3React } from "@web3-react/core";

// ─── ABI ─────────────────────────────────────────────────────────────────────

const STAKING_ABI = [
  // View
  "function tiers(uint8) view returns (uint256 lockDuration, uint256 multiplierBps, uint256 minStake)",
  "function baseApyBps() view returns (uint256)",
  "function effectiveApyBps(uint8 tier) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function pendingRewards(uint256 positionId) view returns (uint256)",
  "function totalPendingRewards(address wallet) view returns (uint256)",
  "function getWalletPositions(address wallet) view returns (uint256[] ids, tuple(uint256 amount, uint256 rewardDebt, uint256 stakedAt, uint256 lockUntil, uint8 tier, bool active)[] positions)",
  "function positions(uint256) view returns (uint256 amount, uint256 rewardDebt, uint256 stakedAt, uint256 lockUntil, uint8 tier, bool active)",
  // Mutations
  "function stake(uint256 amount, uint8 tier) returns (uint256 positionId)",
  "function unstake(uint256 positionId)",
  "function claimRewards(uint256 positionId)",
  "function claimAllRewards()",
  // Events
  "event Staked(address indexed user, uint256 indexed positionId, uint256 amount, uint8 tier, uint256 lockUntil)",
  "event Unstaked(address indexed user, uint256 indexed positionId, uint256 amount, uint256 penalty, bool earlyExit)",
  "event RewardsClaimed(address indexed user, uint256 indexed positionId, uint256 amount)",
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const POLL_BLOCKS = 12; // poll every ~12 blocks
const BLOCK_TIME_MS = 12_000;

const STAKING_ADDRESSES = {
  11155111 : import.meta.env.VITE_STAKING_SEPOLIA     ?? "", // Sepolia
  97       : import.meta.env.VITE_STAKING_BSC_TESTNET ?? "", // BSC Testnet
  31337    : import.meta.env.VITE_STAKING_LOCAL        ?? "", // Localhost
};

const TOKEN_ADDRESSES = {
  11155111 : import.meta.env.VITE_TOKEN_SEPOLIA       ?? "", // Sepolia
  97       : import.meta.env.VITE_TOKEN_BSC_TESTNET   ?? "", // BSC Testnet
  31337    : import.meta.env.VITE_TOKEN_LOCAL          ?? "", // Localhost
};

// ─── Tier metadata ────────────────────────────────────────────────────────────

export const TIER_META = [
  { id: 0, label: "30-Day",  days: 30,  multiplier: "1×",   color: "#4ade80" },
  { id: 1, label: "90-Day",  days: 90,  multiplier: "1.5×", color: "#38bdf8" },
  { id: 2, label: "180-Day", days: 180, multiplier: "2×",   color: "#a78bfa" },
];

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useStaking() {
  const { provider, account, chainId, isActive } = useWeb3React();

  const stakingRef = useRef(null);
  const tokenRef   = useRef(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [tierConfigs,     setTierConfigs]     = useState([]);
  const [effectiveApys,   setEffectiveApys]   = useState([]);
  const [positions,       setPositions]       = useState([]);
  const [positionIds,     setPositionIds]     = useState([]);
  const [pendingByPos,    setPendingByPos]     = useState({});
  const [totalPending,    setTotalPending]    = useState(0n);
  const [totalStaked,     setTotalStaked]     = useState(0n);
  const [tokenBalance,    setTokenBalance]    = useState(0n);
  const [allowance,       setAllowance]       = useState(0n);
  const [loading,         setLoading]         = useState(true);
  const [txPending,       setTxPending]       = useState(false);
  const [txHash,          setTxHash]          = useState("");
  const [error,           setError]           = useState("");

  // ── Build contract instances ──────────────────────────────────────────────
  useEffect(() => {
    if (!provider || !chainId) {
      stakingRef.current = null;
      tokenRef.current   = null;
      return;
    }
    const signer = provider.getSigner ? provider.getSigner() : provider;
    const sAddr  = STAKING_ADDRESSES[chainId] ?? "";
    const tAddr  = TOKEN_ADDRESSES[chainId]   ?? "";

    if (sAddr) stakingRef.current = new ethers.Contract(sAddr, STAKING_ABI, signer);
    if (tAddr) tokenRef.current   = new ethers.Contract(tAddr, TOKEN_ABI, signer);
  }, [provider, chainId]);

  // ── Data fetcher ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const s = stakingRef.current;
    const t = tokenRef.current;
    if (!s) { setLoading(false); return; }

    try {
      const [ts, configs, apys] = await Promise.all([
        s.totalStaked(),
        Promise.all([s.tiers(0), s.tiers(1), s.tiers(2)]),
        Promise.all([s.effectiveApyBps(0), s.effectiveApyBps(1), s.effectiveApyBps(2)]),
      ]);

      setTotalStaked(ts);
      setTierConfigs(configs);
      setEffectiveApys(apys);

      if (account) {
        const [posData, tp] = await Promise.all([
          s.getWalletPositions(account),
          s.totalPendingRewards(account),
        ]);

        const [ids, posArr] = posData;
        setPositionIds(ids);
        setPositions(posArr);
        setTotalPending(tp);

        // Per-position pending rewards
        const pendingMap = {};
        await Promise.all(
          ids.map(async (id) => {
            pendingMap[id.toString()] = await s.pendingRewards(id);
          })
        );
        setPendingByPos(pendingMap);

        // Token balance + allowance
        if (t) {
          const sAddr = await s.getAddress();
          const [bal, alw] = await Promise.all([
            t.balanceOf(account),
            t.allowance(account, sAddr),
          ]);
          setTokenBalance(bal);
          setAllowance(alw);
        }
      }

      setError("");
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setLoading(false);
    }
  }, [account]);

  // ── Polling every ~12 blocks ──────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, BLOCK_TIME_MS * POLL_BLOCKS);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Approve staking contract to spend tokens
   */
  const approve = useCallback(async (amount) => {
    const t = tokenRef.current;
    const s = stakingRef.current;
    if (!t || !s) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    try {
      const sAddr = await s.getAddress();
      const tx    = await t.approve(sAddr, amount ?? ethers.MaxUint256);
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [fetchData]);

  /**
   * Stake VTX tokens into a tier
   * @param {string}  amountStr  Decimal string (e.g. "1000")
   * @param {number}  tier       0 | 1 | 2
   */
  const stake = useCallback(async (amountStr, tier) => {
    const s = stakingRef.current;
    if (!s) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    setTxHash("");

    try {
      const amount = ethers.parseEther(amountStr);

      // Auto-approve if needed
      if (allowance < amount) {
        const t    = tokenRef.current;
        const sAddr = await s.getAddress();
        const approveTx = await t.approve(sAddr, ethers.MaxUint256);
        await approveTx.wait();
      }

      const tx = await s.stake(amount, tier);
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [allowance, fetchData]);

  /**
   * Unstake a position (early-exit penalty applies before lockUntil)
   */
  const unstake = useCallback(async (positionId) => {
    const s = stakingRef.current;
    if (!s) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    setTxHash("");

    try {
      const tx = await s.unstake(positionId);
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [fetchData]);

  /**
   * Claim rewards for a single position
   */
  const claimRewards = useCallback(async (positionId) => {
    const s = stakingRef.current;
    if (!s) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    setTxHash("");

    try {
      const tx = await s.claimRewards(positionId);
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [fetchData]);

  /**
   * Claim all pending rewards across every active position
   */
  const claimAllRewards = useCallback(async () => {
    const s = stakingRef.current;
    if (!s) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    setTxHash("");

    try {
      const tx = await s.claimAllRewards();
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [fetchData]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const activePositions = positions.filter((p) => p.active);

  // Enrich positions with metadata
  const enrichedPositions = activePositions.map((pos, i) => {
    const id        = positionIds[i];
    const tierMeta  = TIER_META[pos.tier] ?? TIER_META[0];
    const now       = Math.floor(Date.now() / 1000);
    const isLocked  = now < Number(pos.lockUntil);
    const pending   = pendingByPos[id?.toString()] ?? 0n;

    return {
      id,
      ...pos,
      tierMeta,
      isLocked,
      pendingRewards: pending,
      lockUntilDate : new Date(Number(pos.lockUntil) * 1000),
      stakedAtDate  : new Date(Number(pos.stakedAt) * 1000),
    };
  });

  return {
    // Connection
    isActive,
    account,
    chainId,
    // Tier info
    tierConfigs,
    effectiveApys,    // BigInt[] in bps
    // Global
    totalStaked,
    // Wallet
    tokenBalance,
    allowance,
    enrichedPositions,
    totalPending,
    // Actions
    approve,
    stake,
    unstake,
    claimRewards,
    claimAllRewards,
    // UI
    loading,
    txPending,
    txHash,
    error,
    refresh: fetchData,
  };
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseRevert(e) {
  return (
    e?.reason ??
    e?.error?.reason ??
    e?.shortMessage ??
    e?.message ??
    "Unknown error"
  )
    .replace("execution reverted: ", "")
    .replace("Error: ", "")
    .trim();
}
