// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./VaultXToken.sol";

/// @title VaultXStaking — Three-tier lock staking with per-block rewards
/// @notice Lock tiers: 30d (1×), 90d (1.5×), 180d (2×). 10% early-exit penalty → treasury.
/// @dev    Rewards accrue per block. Multipliers applied to base APY set by owner.
contract VaultXStaking is Ownable, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────

    enum Tier { THIRTY, NINETY, ONE_EIGHTY }

    struct TierConfig {
        uint256 lockDuration;       // seconds
        uint256 multiplierBps;      // basis points (10000 = 1×, 15000 = 1.5×, 20000 = 2×)
        uint256 minStake;           // minimum tokens to stake
    }

    struct StakePosition {
        uint256 amount;             // tokens staked
        uint256 rewardDebt;         // reward debt at time of stake/claim
        uint256 stakedAt;           // timestamp
        uint256 lockUntil;          // timestamp when freely unstakeable
        Tier    tier;
        bool    active;
    }

    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    uint256 public constant EARLY_EXIT_PENALTY_BPS = 1000;  // 10%
    uint256 public constant BPS_DENOMINATOR        = 10_000;
    uint256 public constant PRECISION              = 1e18;

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    VaultXToken public immutable token;
    address     public treasury;

    TierConfig[3] public tiers;

    /// @notice Base APY in basis points (e.g. 2000 = 20%). Multiplied by tier modifier.
    uint256 public baseApyBps = 2_000;

    /// @notice Blocks per year used for per-block reward calc (Ethereum ≈ 2_628_000, BSC ≈ 10_512_000)
    uint256 public blocksPerYear = 2_628_000;

    /// @notice Accumulated reward per token (PRECISION-scaled), updated on every interaction
    uint256 public accRewardPerToken;

    /// @notice Last block number accRewardPerToken was updated
    uint256 public lastRewardBlock;

    /// @notice Total tokens currently staked across all positions
    uint256 public totalStaked;

    /// @notice Total reward tokens distributed (for accounting)
    uint256 public totalRewardsPaid;

    // positionId counter
    uint256 private _nextPositionId = 1;

    // wallet → positionId[]
    mapping(address => uint256[]) public walletPositionIds;

    // positionId → StakePosition
    mapping(uint256 => StakePosition) public positions;

    // positionId → owner
    mapping(uint256 => address) public positionOwner;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event Staked(
        address indexed user,
        uint256 indexed positionId,
        uint256         amount,
        Tier            tier,
        uint256         lockUntil
    );
    event Unstaked(
        address indexed user,
        uint256 indexed positionId,
        uint256         amount,
        uint256         penalty,
        bool            earlyExit
    );
    event RewardsClaimed(
        address indexed user,
        uint256 indexed positionId,
        uint256         amount
    );
    event BaseApyUpdated(uint256 newApyBps);
    event TreasuryUpdated(address indexed newTreasury);
    event BlocksPerYearUpdated(uint256 newValue);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _token, address _treasury, address _owner)
        Ownable(_owner)
    {
        require(_token    != address(0), "VaultXStaking: zero token");
        require(_treasury != address(0), "VaultXStaking: zero treasury");

        token    = VaultXToken(_token);
        treasury = _treasury;
        lastRewardBlock = block.number;

        // Tier 0 — 30 days, 1× multiplier
        tiers[uint8(Tier.THIRTY)] = TierConfig({
            lockDuration  : 30 days,
            multiplierBps : 10_000,
            minStake      : 100 ether   // 100 VTX
        });

        // Tier 1 — 90 days, 1.5× multiplier
        tiers[uint8(Tier.NINETY)] = TierConfig({
            lockDuration  : 90 days,
            multiplierBps : 15_000,
            minStake      : 100 ether
        });

        // Tier 2 — 180 days, 2× multiplier
        tiers[uint8(Tier.ONE_EIGHTY)] = TierConfig({
            lockDuration  : 180 days,
            multiplierBps : 20_000,
            minStake      : 100 ether
        });
    }

    // ─────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────

    function setBaseApy(uint256 apyBps) external onlyOwner {
        require(apyBps > 0 && apyBps <= 100_000, "VaultXStaking: bad APY");
        _updatePool();
        baseApyBps = apyBps;
        emit BaseApyUpdated(apyBps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "VaultXStaking: zero address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setBlocksPerYear(uint256 bpy) external onlyOwner {
        require(bpy > 0, "VaultXStaking: zero");
        _updatePool();
        blocksPerYear = bpy;
        emit BlocksPerYearUpdated(bpy);
    }

    function setTierMinStake(Tier tier, uint256 minStake) external onlyOwner {
        tiers[uint8(tier)].minStake = minStake;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────
    // Core — Stake
    // ─────────────────────────────────────────────

    /// @notice Stake tokens into a new position
    /// @param amount   Tokens to stake (must be approved first)
    /// @param tier     Lock tier (THIRTY / NINETY / ONE_EIGHTY)
    function stake(uint256 amount, Tier tier)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        TierConfig storage tc = tiers[uint8(tier)];
        require(amount >= tc.minStake, "VaultXStaking: below min stake");

        _updatePool();

        // transfer tokens in
        token.transferFrom(msg.sender, address(this), amount);
        totalStaked += amount;

        // create position
        positionId = _nextPositionId++;
        positions[positionId] = StakePosition({
            amount     : amount,
            rewardDebt : accRewardPerToken,
            stakedAt   : block.timestamp,
            lockUntil  : block.timestamp + tc.lockDuration,
            tier       : tier,
            active     : true
        });
        positionOwner[positionId]         = msg.sender;
        walletPositionIds[msg.sender].push(positionId);

        emit Staked(msg.sender, positionId, amount, tier, positions[positionId].lockUntil);
    }

    // ─────────────────────────────────────────────
    // Core — Unstake
    // ─────────────────────────────────────────────

    /// @notice Unstake a position. 10% penalty applies if before lockUntil.
    function unstake(uint256 positionId) external nonReentrant whenNotPaused {
        require(positionOwner[positionId] == msg.sender, "VaultXStaking: not owner");
        StakePosition storage pos = positions[positionId];
        require(pos.active, "VaultXStaking: not active");

        _updatePool();

        // claim pending rewards first
        uint256 pending = _pendingRewards(positionId);
        if (pending > 0) {
            _mintReward(msg.sender, pending);
            emit RewardsClaimed(msg.sender, positionId, pending);
        }

        uint256 amount    = pos.amount;
        uint256 penalty   = 0;
        bool    earlyExit = block.timestamp < pos.lockUntil;

        if (earlyExit) {
            penalty = (amount * EARLY_EXIT_PENALTY_BPS) / BPS_DENOMINATOR;
            token.transfer(treasury, penalty);
        }

        uint256 returnAmount = amount - penalty;
        pos.active     = false;
        pos.amount     = 0;
        totalStaked   -= amount;

        token.transfer(msg.sender, returnAmount);

        emit Unstaked(msg.sender, positionId, returnAmount, penalty, earlyExit);
    }

    // ─────────────────────────────────────────────
    // Core — Claim Rewards
    // ─────────────────────────────────────────────

    /// @notice Claim pending rewards for a specific position
    function claimRewards(uint256 positionId) external nonReentrant whenNotPaused {
        require(positionOwner[positionId] == msg.sender, "VaultXStaking: not owner");
        StakePosition storage pos = positions[positionId];
        require(pos.active, "VaultXStaking: not active");

        _updatePool();

        uint256 pending = _pendingRewards(positionId);
        require(pending > 0, "VaultXStaking: no rewards");

        pos.rewardDebt = accRewardPerToken;
        _mintReward(msg.sender, pending);

        emit RewardsClaimed(msg.sender, positionId, pending);
    }

    /// @notice Claim all rewards across all active positions for caller
    function claimAllRewards() external nonReentrant whenNotPaused {
        _updatePool();
        uint256[] storage ids = walletPositionIds[msg.sender];
        uint256 totalPending;

        for (uint256 i = 0; i < ids.length; i++) {
            StakePosition storage pos = positions[ids[i]];
            if (!pos.active) continue;

            uint256 pending = _pendingRewards(ids[i]);
            if (pending > 0) {
                totalPending += pending;
                pos.rewardDebt = accRewardPerToken;
                emit RewardsClaimed(msg.sender, ids[i], pending);
            }
        }

        require(totalPending > 0, "VaultXStaking: no rewards");
        _mintReward(msg.sender, totalPending);
    }

    // ─────────────────────────────────────────────
    // View Helpers
    // ─────────────────────────────────────────────

    /// @notice Pending rewards for a specific position (not yet claimed)
    function pendingRewards(uint256 positionId) external view returns (uint256) {
        return _pendingRewards(positionId);
    }

    /// @notice Total pending rewards across all positions for a wallet
    function totalPendingRewards(address wallet) external view returns (uint256 total) {
        uint256[] storage ids = walletPositionIds[wallet];
        uint256 simulatedAcc  = _simulateAccRewardPerToken();

        for (uint256 i = 0; i < ids.length; i++) {
            StakePosition storage pos = positions[ids[i]];
            if (!pos.active) continue;

            // apply tier multiplier
            uint256 tierMultiplier = tiers[uint8(pos.tier)].multiplierBps;
            uint256 base = (pos.amount * (simulatedAcc - pos.rewardDebt)) / PRECISION;
            total += (base * tierMultiplier) / BPS_DENOMINATOR;
        }
    }

    /// @notice All positions for a wallet
    function getWalletPositions(address wallet)
        external
        view
        returns (uint256[] memory ids, StakePosition[] memory posArr)
    {
        ids    = walletPositionIds[wallet];
        posArr = new StakePosition[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            posArr[i] = positions[ids[i]];
        }
    }

    /// @notice Effective APY for a tier in basis points
    function effectiveApyBps(Tier tier) external view returns (uint256) {
        return (baseApyBps * tiers[uint8(tier)].multiplierBps) / BPS_DENOMINATOR;
    }

    // ─────────────────────────────────────────────
    // Internal — Pool Accounting
    // ─────────────────────────────────────────────

    /// @dev Update accRewardPerToken based on blocks elapsed since lastRewardBlock.
    ///      Reward rate: (baseApyBps / BPS_DENOMINATOR) * totalStaked / blocksPerYear per block.
    function _updatePool() internal {
        if (totalStaked == 0) {
            lastRewardBlock = block.number;
            return;
        }

        uint256 blocksElapsed = block.number - lastRewardBlock;
        if (blocksElapsed == 0) return;

        // rewardPerBlock = totalStaked * baseApyBps / BPS_DENOMINATOR / blocksPerYear
        // rewardPerToken = rewardPerBlock * PRECISION / totalStaked
        //                = baseApyBps * PRECISION / BPS_DENOMINATOR / blocksPerYear
        uint256 rewardPerTokenPerBlock =
            (baseApyBps * PRECISION) / (BPS_DENOMINATOR * blocksPerYear);

        accRewardPerToken  += rewardPerTokenPerBlock * blocksElapsed;
        lastRewardBlock     = block.number;
    }

    function _simulateAccRewardPerToken() internal view returns (uint256 simAcc) {
        simAcc = accRewardPerToken;
        if (totalStaked == 0) return simAcc;

        uint256 blocksElapsed = block.number - lastRewardBlock;
        if (blocksElapsed == 0) return simAcc;

        uint256 rewardPerTokenPerBlock =
            (baseApyBps * PRECISION) / (BPS_DENOMINATOR * blocksPerYear);

        simAcc += rewardPerTokenPerBlock * blocksElapsed;
    }

    function _pendingRewards(uint256 positionId) internal view returns (uint256) {
        StakePosition storage pos = positions[positionId];
        if (!pos.active || pos.amount == 0) return 0;

        uint256 simAcc = _simulateAccRewardPerToken();
        uint256 tierMultiplier = tiers[uint8(pos.tier)].multiplierBps;

        uint256 base = (pos.amount * (simAcc - pos.rewardDebt)) / PRECISION;
        return (base * tierMultiplier) / BPS_DENOMINATOR;
    }

    function _mintReward(address to, uint256 amount) internal {
        totalRewardsPaid += amount;
        token.mint(to, amount);
    }
}
