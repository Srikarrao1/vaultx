// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./VaultXToken.sol";

/// @title VaultXStaking — Three-tier lock staking with per-block rewards
/// @notice Lock tiers: 30d (1×), 90d (1.5×), 180d (2×). 10% early-exit penalty → treasury.
/// @dev    MasterChef-style accRewardPerToken accumulation.
///         rewardDebt stores raw accRewardPerToken at stake/claim time (NOT amount-weighted).
///         Pending = amount × (currentAccPerToken − rewardDebt) / PRECISION × tierMultiplier.
contract VaultXStaking is Ownable, ReentrancyGuard, Pausable {

    enum Tier { THIRTY, NINETY, ONE_EIGHTY }

    struct TierConfig {
        uint256 lockDuration;
        uint256 multiplierBps;
        uint256 minStake;
    }

    struct StakePosition {
        uint256 amount;
        uint256 rewardDebt;   // raw accRewardPerToken at last update (NOT amount-weighted)
        uint256 stakedAt;
        uint256 lockUntil;
        Tier    tier;
        bool    active;
    }

    uint256 public constant EARLY_EXIT_PENALTY_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR        = 10_000;
    uint256 public constant PRECISION              = 1e18;

    VaultXToken public immutable token;
    address     public treasury;

    TierConfig[3] public tiers;

    uint256 public baseApyBps    = 2_000;
    uint256 public blocksPerYear = 2_628_000;

    uint256 public accRewardPerToken;   // cumulative reward per staked token (PRECISION-scaled)
    uint256 public lastRewardBlock;
    uint256 public totalStaked;
    uint256 public totalRewardsPaid;

    uint256 private _nextPositionId = 1;

    mapping(address => uint256[]) public walletPositionIds;
    mapping(uint256 => StakePosition) public positions;
    mapping(uint256 => address) public positionOwner;

    event Staked(address indexed user, uint256 indexed positionId, uint256 amount, Tier tier, uint256 lockUntil);
    event Unstaked(address indexed user, uint256 indexed positionId, uint256 amount, uint256 penalty, bool earlyExit);
    event RewardsClaimed(address indexed user, uint256 indexed positionId, uint256 amount);
    event BaseApyUpdated(uint256 newApyBps);
    event TreasuryUpdated(address indexed newTreasury);
    event BlocksPerYearUpdated(uint256 newValue);

    constructor(address _token, address _treasury, address _owner) Ownable(_owner) {
        require(_token    != address(0), "VaultXStaking: zero token");
        require(_treasury != address(0), "VaultXStaking: zero treasury");
        token    = VaultXToken(_token);
        treasury = _treasury;
        lastRewardBlock = block.number;

        tiers[uint8(Tier.THIRTY)]      = TierConfig({ lockDuration: 30 days,  multiplierBps: 10_000, minStake: 100 ether });
        tiers[uint8(Tier.NINETY)]      = TierConfig({ lockDuration: 90 days,  multiplierBps: 15_000, minStake: 100 ether });
        tiers[uint8(Tier.ONE_EIGHTY)]  = TierConfig({ lockDuration: 180 days, multiplierBps: 20_000, minStake: 100 ether });
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setBaseApy(uint256 _apyBps) external onlyOwner {
        require(_apyBps > 0 && _apyBps <= 100_000, "VaultXStaking: bad APY");
        _updatePool();
        baseApyBps = _apyBps;
        emit BaseApyUpdated(_apyBps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "VaultXStaking: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setBlocksPerYear(uint256 _bpy) external onlyOwner {
        require(_bpy > 0, "VaultXStaking: zero");
        _updatePool();
        blocksPerYear = _bpy;
        emit BlocksPerYearUpdated(_bpy);
    }

    function setTierMinStake(Tier tier, uint256 minStake) external onlyOwner {
        tiers[uint8(tier)].minStake = minStake;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Core — Stake ──────────────────────────────────────────────────────────

    function stake(uint256 amount, Tier tier)
        external nonReentrant whenNotPaused
        returns (uint256 positionId)
    {
        TierConfig storage tc = tiers[uint8(tier)];
        require(amount >= tc.minStake, "VaultXStaking: below min stake");

        _updatePool();
        token.transferFrom(msg.sender, address(this), amount);
        totalStaked += amount;

        positionId = _nextPositionId++;
        positions[positionId] = StakePosition({
            amount     : amount,
            rewardDebt : accRewardPerToken,  // ← raw per-token value (correct MasterChef pattern)
            stakedAt   : block.timestamp,
            lockUntil  : block.timestamp + tc.lockDuration,
            tier       : tier,
            active     : true
        });
        positionOwner[positionId]    = msg.sender;
        walletPositionIds[msg.sender].push(positionId);

        emit Staked(msg.sender, positionId, amount, tier, positions[positionId].lockUntil);
    }

    // ── Core — Unstake ────────────────────────────────────────────────────────

    function unstake(uint256 positionId) external nonReentrant whenNotPaused {
        require(positionOwner[positionId] == msg.sender, "VaultXStaking: not owner");
        StakePosition storage pos = positions[positionId];
        require(pos.active, "VaultXStaking: not active");

        _updatePool();

        uint256 pending = _pendingRewards(positionId);
        if (pending > 0) {
            pos.rewardDebt = accRewardPerToken;  // ← update before mint
            _mintReward(msg.sender, pending);
            emit RewardsClaimed(msg.sender, positionId, pending);
        }

        uint256 amount    = pos.amount;
        bool    earlyExit = block.timestamp < pos.lockUntil;
        uint256 penalty   = 0;

        if (earlyExit) {
            penalty = (amount * EARLY_EXIT_PENALTY_BPS) / BPS_DENOMINATOR;
            token.transfer(treasury, penalty);
        }

        pos.active   = false;
        pos.amount   = 0;
        totalStaked -= amount;

        token.transfer(msg.sender, amount - penalty);
        emit Unstaked(msg.sender, positionId, amount - penalty, penalty, earlyExit);
    }

    // ── Core — Claim Rewards ──────────────────────────────────────────────────

    function claimRewards(uint256 positionId) external nonReentrant whenNotPaused {
        require(positionOwner[positionId] == msg.sender, "VaultXStaking: not owner");
        StakePosition storage pos = positions[positionId];
        require(pos.active, "VaultXStaking: not active");

        _updatePool();

        uint256 pending = _pendingRewards(positionId);
        require(pending > 0, "VaultXStaking: no rewards");

        pos.rewardDebt = accRewardPerToken;  // ← update to current per-token value
        _mintReward(msg.sender, pending);
        emit RewardsClaimed(msg.sender, positionId, pending);
    }

    function claimAllRewards() external nonReentrant whenNotPaused {
        _updatePool();
        uint256[] storage ids = walletPositionIds[msg.sender];
        uint256 totalPending;

        for (uint256 i = 0; i < ids.length; i++) {
            StakePosition storage pos = positions[ids[i]];
            if (!pos.active) continue;
            uint256 pending = _pendingRewards(ids[i]);
            if (pending > 0) {
                totalPending   += pending;
                pos.rewardDebt  = accRewardPerToken;  // ← update per position
                emit RewardsClaimed(msg.sender, ids[i], pending);
            }
        }

        require(totalPending > 0, "VaultXStaking: no rewards");
        _mintReward(msg.sender, totalPending);
    }

    // ── View Helpers ──────────────────────────────────────────────────────────

    function pendingRewards(uint256 positionId) external view returns (uint256) {
        return _pendingRewards(positionId);
    }

    function totalPendingRewards(address wallet) external view returns (uint256 total) {
        uint256[] storage ids    = walletPositionIds[wallet];
        uint256 simulatedAcc     = _simulateAccRewardPerToken();
        for (uint256 i = 0; i < ids.length; i++) {
            StakePosition storage pos = positions[ids[i]];
            if (!pos.active) continue;
            uint256 tierMultiplier = tiers[uint8(pos.tier)].multiplierBps;
            uint256 delta = simulatedAcc - pos.rewardDebt;
            uint256 base  = (pos.amount * delta) / PRECISION;
            total += (base * tierMultiplier) / BPS_DENOMINATOR;
        }
    }

    function getWalletPositions(address wallet)
        external view
        returns (uint256[] memory ids, StakePosition[] memory posArr)
    {
        ids    = walletPositionIds[wallet];
        posArr = new StakePosition[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) posArr[i] = positions[ids[i]];
    }

    function effectiveApyBps(Tier tier) external view returns (uint256) {
        return (baseApyBps * tiers[uint8(tier)].multiplierBps) / BPS_DENOMINATOR;
    }

    // ── Internal — Pool Accounting ─────────────────────────────────────────

    function _updatePool() internal {
        if (totalStaked == 0) { lastRewardBlock = block.number; return; }
        uint256 blocksElapsed = block.number - lastRewardBlock;
        if (blocksElapsed == 0) return;
        // rewardPerTokenPerBlock = baseApyBps × PRECISION / (BPS_DENOMINATOR × blocksPerYear)
        uint256 rptpb = (baseApyBps * PRECISION) / (BPS_DENOMINATOR * blocksPerYear);
        accRewardPerToken  += rptpb * blocksElapsed;
        lastRewardBlock     = block.number;
    }

    function _simulateAccRewardPerToken() internal view returns (uint256 simAcc) {
        simAcc = accRewardPerToken;
        if (totalStaked == 0) return simAcc;
        uint256 blocksElapsed = block.number - lastRewardBlock;
        if (blocksElapsed == 0) return simAcc;
        uint256 rptpb = (baseApyBps * PRECISION) / (BPS_DENOMINATOR * blocksPerYear);
        simAcc += rptpb * blocksElapsed;
    }

    /// @dev pending = amount × (simAcc − rewardDebt) / PRECISION × tierMultiplier / BPS_DENOMINATOR
    ///      rewardDebt is stored as raw accRewardPerToken (per-token, PRECISION-scaled).
    ///      simAcc >= rewardDebt always because accRewardPerToken is monotonically increasing.
    function _pendingRewards(uint256 positionId) internal view returns (uint256) {
        StakePosition storage pos = positions[positionId];
        if (!pos.active || pos.amount == 0) return 0;
        uint256 simAcc = _simulateAccRewardPerToken();
        // simAcc >= pos.rewardDebt (monotonically increasing), no underflow possible
        uint256 delta  = simAcc - pos.rewardDebt;
        uint256 base   = (pos.amount * delta) / PRECISION;
        uint256 mult   = tiers[uint8(pos.tier)].multiplierBps;
        return (base * mult) / BPS_DENOMINATOR;
    }

    function _mintReward(address to, uint256 amount) internal {
        totalRewardsPaid += amount;
        token.mint(to, amount);
    }
}
