// hooks/usePresale.js
// Connects to the PresaleVault contract via ethers.js + useWeb3React
// Polls round data, raise progress, vesting schedule, and exposes buyTokens / claimVested

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useWeb3React } from "@web3-react/core";

// ─── ABI (minimal surface — add full ABI from compilation artifact) ───────────

const PRESALE_ABI = [
  // Round data
  "function rounds(uint8) view returns (uint256 pricePerToken, uint256 hardcap, uint256 totalRaised, uint256 minBuy, uint256 maxBuy, uint256 startTime, uint256 endTime, bool whitelistRequired, bytes32 merkleRoot, bool finalized)",
  "function getAllRounds() view returns (tuple(uint256 pricePerToken, uint256 hardcap, uint256 totalRaised, uint256 minBuy, uint256 maxBuy, uint256 startTime, uint256 endTime, bool whitelistRequired, bytes32 merkleRoot, bool finalized)[3])",
  "function activeRound() view returns (uint8)",
  "function saleOpen() view returns (bool)",
  "function roundTimeLeft() view returns (uint256)",
  "function totalRaisedAllRounds() view returns (uint256)",
  "function totalHardcap() view returns (uint256)",
  // Wallet-specific
  "function vestingOf(address) view returns (uint256 totalTokens, uint256 claimedTokens, uint256 vestStart, uint256 vestDuration)",
  "function claimableAmount(address) view returns (uint256)",
  "function walletRaised(address, uint8) view returns (uint256)",
  // Mutations
  "function buyTokens(bytes32[] calldata merkleProof) payable",
  "function claimVested()",
  // Events
  "event TokensPurchased(address indexed buyer, uint8 indexed roundIndex, uint256 nativeAmount, uint256 tokenAmount)",
  "event VestingClaimed(address indexed claimer, uint256 tokenAmount)",
  "event RoundOpened(uint8 indexed roundIndex, uint256 startTime, uint256 endTime)",
  "event RoundClosed(uint8 indexed roundIndex, uint256 totalRaised)",
];

const POLL_INTERVAL_MS = 12_000; // ~12 seconds (1 Ethereum block)

// Contract addresses per chainId — set via env or deployment artifact
const CONTRACT_ADDRESSES = {
  5     : process.env.NEXT_PUBLIC_VAULT_GOERLI      ?? "", // Goerli
  97    : process.env.NEXT_PUBLIC_VAULT_BSC_TESTNET ?? "", // BSC Testnet
  31337 : process.env.NEXT_PUBLIC_VAULT_LOCAL        ?? "", // Localhost
};

// ─── Types ────────────────────────────────────────────────────────────────────

// RoundType enum mirrors Solidity
export const RoundType = { PRE_SEED: 0, SEED: 1, PUBLIC: 2 };
export const ROUND_NAMES = ["Pre-Seed", "Seed", "Public"];

// ─── Helper: round index → human label ───────────────────────────────────────

export function roundLabel(index) {
  return ROUND_NAMES[index] ?? "Unknown";
}

// ─── Helper: format token amounts ─────────────────────────────────────────────

export function formatVTX(wei) {
  if (!wei) return "0";
  return Number(ethers.formatEther(wei)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function usePresale() {
  const { provider, account, chainId, isActive } = useWeb3React();

  // ── Contract ref ────────────────────────────────────────────────────────────
  const contractRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────────────────
  const [contractAddress, setContractAddress] = useState("");
  const [saleOpen,        setSaleOpen]        = useState(false);
  const [activeRound,     setActiveRound]     = useState(0);
  const [rounds,          setRounds]          = useState([]);
  const [timeLeft,        setTimeLeft]        = useState(0n);      // seconds
  const [totalRaised,     setTotalRaised]     = useState(0n);
  const [hardcap,         setHardcap]         = useState(0n);
  const [vesting,         setVesting]         = useState(null);    // vestingOf result
  const [claimable,       setClaimable]       = useState(0n);
  const [walletContrib,   setWalletContrib]   = useState(0n);      // wallet spend this round
  const [loading,         setLoading]         = useState(true);
  const [txPending,       setTxPending]       = useState(false);
  const [txHash,          setTxHash]          = useState("");
  const [error,           setError]           = useState("");

  // ── Resolve contract address per chain ──────────────────────────────────────
  useEffect(() => {
    if (!chainId) return;
    const addr = CONTRACT_ADDRESSES[chainId] ?? "";
    setContractAddress(addr);
  }, [chainId]);

  // ── Build ethers contract instance ──────────────────────────────────────────
  useEffect(() => {
    if (!provider || !contractAddress) {
      contractRef.current = null;
      return;
    }
    const signer     = provider.getSigner ? provider.getSigner() : provider;
    contractRef.current = new ethers.Contract(contractAddress, PRESALE_ABI, signer);
  }, [provider, contractAddress]);

  // ── Data fetcher ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const c = contractRef.current;
    if (!c) {
      setLoading(false);
      return;
    }

    try {
      const [
        allRounds,
        activeIdx,
        open,
        tLeft,
        raised,
        cap,
      ] = await Promise.all([
        c.getAllRounds(),
        c.activeRound(),
        c.saleOpen(),
        c.roundTimeLeft(),
        c.totalRaisedAllRounds(),
        c.totalHardcap(),
      ]);

      setRounds(allRounds);
      setActiveRound(Number(activeIdx));
      setSaleOpen(open);
      setTimeLeft(tLeft);
      setTotalRaised(raised);
      setHardcap(cap);

      // Wallet-specific
      if (account) {
        const [vest, claim, contrib] = await Promise.all([
          c.vestingOf(account),
          c.claimableAmount(account),
          c.walletRaised(account, activeIdx),
        ]);
        setVesting(vest);
        setClaimable(claim);
        setWalletContrib(contrib);
      }

      setError("");
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setLoading(false);
    }
  }, [account]);

  // ── Polling ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Countdown ticker (client-side, 1-second) ──────────────────────────────
  useEffect(() => {
    if (timeLeft <= 0n) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev > 0n ? prev - 1n : 0n));
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Buy tokens in the active round.
   * @param {string} nativeAmount  ETH/BNB as a decimal string (e.g. "0.5")
   * @param {string[]} merkleProof Hex-encoded proof leaves ([] for public round)
   */
  const buyTokens = useCallback(
    async (nativeAmount, merkleProof = []) => {
      const c = contractRef.current;
      if (!c) { setError("Wallet not connected"); return; }

      setTxPending(true);
      setError("");
      setTxHash("");

      try {
        const value = ethers.parseEther(nativeAmount);
        const tx    = await c.buyTokens(merkleProof, { value });
        setTxHash(tx.hash);
        await tx.wait();
        await fetchData();
      } catch (e) {
        setError(parseRevert(e));
      } finally {
        setTxPending(false);
      }
    },
    [fetchData]
  );

  /**
   * Claim all unlocked vested tokens.
   */
  const claimVested = useCallback(async () => {
    const c = contractRef.current;
    if (!c) { setError("Wallet not connected"); return; }

    setTxPending(true);
    setError("");
    setTxHash("");

    try {
      const tx = await c.claimVested();
      setTxHash(tx.hash);
      await tx.wait();
      await fetchData();
    } catch (e) {
      setError(parseRevert(e));
    } finally {
      setTxPending(false);
    }
  }, [fetchData]);

  // ── Derived values ────────────────────────────────────────────────────────────

  const progressPct =
    hardcap > 0n ? Number((totalRaised * 10000n) / hardcap) / 100 : 0;

  const currentRound = rounds[activeRound] ?? null;

  // Estimated VTX output for a given native amount input
  const estimateTokens = useCallback(
    (nativeStr) => {
      if (!currentRound || !nativeStr) return 0n;
      try {
        const value = ethers.parseEther(nativeStr);
        return (value * ethers.parseEther("1")) / currentRound.pricePerToken;
      } catch {
        return 0n;
      }
    },
    [currentRound]
  );

  // Next unlock timestamp (vest start for now — linear means partial before)
  const nextUnlockDate = vesting
    ? new Date(Number(vesting.vestStart) * 1000)
    : null;

  // Full unlock timestamp
  const fullUnlockDate = vesting
    ? new Date(Number(vesting.vestStart + vesting.vestDuration) * 1000)
    : null;

  return {
    // connection
    isActive,
    account,
    chainId,
    contractAddress,
    // round state
    saleOpen,
    activeRound,
    rounds,
    currentRound,
    timeLeft,         // BigInt seconds
    // raise progress
    totalRaised,
    hardcap,
    progressPct,      // number 0-100
    // wallet
    vesting,
    claimable,
    walletContrib,
    // derived
    estimateTokens,
    nextUnlockDate,
    fullUnlockDate,
    // actions
    buyTokens,
    claimVested,
    // ui state
    loading,
    txPending,
    txHash,
    error,
    refresh: fetchData,
  };
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseRevert(e) {
  // ethers v6 error structure
  const reason =
    e?.reason ??
    e?.error?.reason ??
    e?.shortMessage ??
    e?.message ??
    "Unknown error";

  // Strip ethers noise
  return reason
    .replace("execution reverted: ", "")
    .replace("Error: ", "")
    .trim();
}
