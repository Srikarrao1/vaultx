// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./VaultXToken.sol";

/// @title PresaleVault — Tiered token presale with merkle whitelist & linear vesting
/// @notice Supports ETH + BNB networks, three rounds, and per-wallet linear vesting
/// @dev Gas target: buyTokens() < 150k gas.
///      Key optimisations: no mint in buyTokens (mint on claim), packed VestingSchedule,
///      no per-user vestDuration SSTORE (use global).
contract PresaleVault is Ownable, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────

    enum RoundType { PRE_SEED, SEED, PUBLIC }

    struct Round {
        uint256 pricePerToken;
        uint256 hardcap;
        uint256 totalRaised;
        uint256 minBuy;
        uint256 maxBuy;
        uint256 startTime;
        uint256 endTime;
        bool    whitelistRequired;
        bytes32 merkleRoot;
        bool    finalized;
    }

    /// @dev Packed into 2 storage slots instead of 4:
    ///      slot 0 → totalTokens (uint128) + claimedTokens (uint128)
    ///      slot 1 → vestStart   (uint64)  [vestDuration uses global, not stored per-user]
    struct VestingSchedule {
        uint128 totalTokens;
        uint128 claimedTokens;
        uint64  vestStart;
    }

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    VaultXToken public immutable token;

    Round[3]  public rounds;
    RoundType public activeRound;
    bool      public saleOpen;

    address public treasury;
    uint256 public vestingDuration = 180 days;

    mapping(address => mapping(uint8 => uint256)) public walletRaised;
    mapping(address => VestingSchedule)           public vestingOf;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event TokensPurchased(address indexed buyer, uint8 indexed roundIndex, uint256 nativeAmount, uint256 tokenAmount);
    event VestingClaimed(address indexed claimer, uint256 tokenAmount);
    event RoundOpened(uint8 indexed roundIndex, uint256 startTime, uint256 endTime);
    event RoundClosed(uint8 indexed roundIndex, uint256 totalRaised);
    event TreasuryUpdated(address indexed newTreasury);
    event VestingDurationUpdated(uint256 newDuration);
    event FundsWithdrawn(address indexed treasury, uint256 amount);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _token, address _treasury, address _owner) Ownable(_owner) {
        require(_token    != address(0), "PresaleVault: zero token");
        require(_treasury != address(0), "PresaleVault: zero treasury");
        token    = VaultXToken(_token);
        treasury = _treasury;

        rounds[uint8(RoundType.PRE_SEED)] = Round({
            pricePerToken: 0.00005 ether, hardcap: 100 ether, totalRaised: 0,
            minBuy: 0.01 ether, maxBuy: 2 ether, startTime: 0, endTime: 0,
            whitelistRequired: true, merkleRoot: bytes32(0), finalized: false
        });
        rounds[uint8(RoundType.SEED)] = Round({
            pricePerToken: 0.0001 ether, hardcap: 500 ether, totalRaised: 0,
            minBuy: 0.01 ether, maxBuy: 5 ether, startTime: 0, endTime: 0,
            whitelistRequired: true, merkleRoot: bytes32(0), finalized: false
        });
        rounds[uint8(RoundType.PUBLIC)] = Round({
            pricePerToken: 0.0002 ether, hardcap: 2000 ether, totalRaised: 0,
            minBuy: 0.005 ether, maxBuy: 10 ether, startTime: 0, endTime: 0,
            whitelistRequired: false, merkleRoot: bytes32(0), finalized: false
        });
    }

    // ─────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────

    function openRound(uint8 roundIndex, uint256 startTime, uint256 endTime, bytes32 merkleRoot)
        external onlyOwner
    {
        require(roundIndex < 3,       "PresaleVault: invalid round");
        require(endTime > startTime,  "PresaleVault: bad window");
        require(!rounds[roundIndex].finalized, "PresaleVault: already finalized");

        if (saleOpen) _closeRound(uint8(activeRound));

        Round storage r = rounds[roundIndex];
        r.startTime  = startTime;
        r.endTime    = endTime;
        r.merkleRoot = merkleRoot;

        activeRound = RoundType(roundIndex);
        saleOpen    = true;
        emit RoundOpened(roundIndex, startTime, endTime);
    }

    function closeCurrentRound() external onlyOwner {
        require(saleOpen, "PresaleVault: no open round");
        _closeRound(uint8(activeRound));
        saleOpen = false;
    }

    function _closeRound(uint8 roundIndex) internal {
        rounds[roundIndex].finalized = true;
        emit RoundClosed(roundIndex, rounds[roundIndex].totalRaised);
    }

    function setMerkleRoot(uint8 roundIndex, bytes32 root) external onlyOwner {
        require(roundIndex < 3, "PresaleVault: invalid round");
        rounds[roundIndex].merkleRoot = root;
    }

    function setRoundPrice(uint8 roundIndex, uint256 pricePerToken) external onlyOwner {
        require(roundIndex < 3,    "PresaleVault: invalid round");
        require(pricePerToken > 0, "PresaleVault: zero price");
        require(!rounds[roundIndex].finalized, "PresaleVault: finalized");
        rounds[roundIndex].pricePerToken = pricePerToken;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "PresaleVault: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setVestingDuration(uint256 _duration) external onlyOwner {
        require(_duration > 0, "PresaleVault: zero duration");
        vestingDuration = _duration;
        emit VestingDurationUpdated(_duration);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────
    // Core — Buy Tokens  (gas target < 150k)
    // ─────────────────────────────────────────────

    /// @notice Purchase tokens in the active round.
    /// @dev    NO mint here — tokens are minted directly to buyer on claimVested().
    ///         This saves ~50k gas vs minting to the vault first.
    function buyTokens(bytes32[] calldata merkleProof)
        external payable nonReentrant whenNotPaused
    {
        require(saleOpen, "PresaleVault: sale not open");

        uint8  idx = uint8(activeRound);
        Round storage r = rounds[idx];

        require(block.timestamp >= r.startTime, "PresaleVault: not started");
        require(block.timestamp <= r.endTime,   "PresaleVault: round ended");
        require(!r.finalized,                   "PresaleVault: round finalized");
        require(msg.value >= r.minBuy,          "PresaleVault: below min buy");

        uint256 newWalletTotal = walletRaised[msg.sender][idx] + msg.value;
        require(newWalletTotal <= r.maxBuy, "PresaleVault: exceeds wallet cap");

        uint256 newRoundTotal = r.totalRaised + msg.value;
        require(newRoundTotal <= r.hardcap, "PresaleVault: hardcap reached");

        if (r.whitelistRequired) {
            require(_verifyWhitelist(idx, msg.sender, merkleProof), "PresaleVault: not whitelisted");
        }

        uint256 tokenAmount = (msg.value * 1 ether) / r.pricePerToken;

        r.totalRaised                 = newRoundTotal;
        walletRaised[msg.sender][idx] = newWalletTotal;

        // Pack vesting update into 2 slots max:
        // slot 0: totalTokens + claimedTokens (uint128 each)
        // slot 1: vestStart   (uint64)
        VestingSchedule storage vs = vestingOf[msg.sender];
        if (vs.totalTokens == 0) {
            vs.vestStart = uint64(block.timestamp);  // slot 1 — cold SSTORE
        }
        vs.totalTokens += uint128(tokenAmount);      // slot 0 — cold SSTORE (first), warm after

        // No token.mint here — minted on claim to save gas
        emit TokensPurchased(msg.sender, idx, msg.value, tokenAmount);

        if (newRoundTotal == r.hardcap) {
            _closeRound(idx);
            saleOpen = false;
        }
    }

    // ─────────────────────────────────────────────
    // Core — Vesting Claim
    // ─────────────────────────────────────────────

    /// @notice Claim all currently unlocked VTX. Tokens are minted on demand.
    function claimVested() external nonReentrant whenNotPaused {
        VestingSchedule storage vs = vestingOf[msg.sender];
        require(vs.totalTokens > 0, "PresaleVault: no allocation");

        uint256 unlocked  = _unlockedAmount(vs);
        uint256 claimable = unlocked - vs.claimedTokens;
        require(claimable > 0, "PresaleVault: nothing to claim");

        vs.claimedTokens += uint128(claimable);
        token.mint(msg.sender, claimable);  // mint directly — vault holds no tokens

        emit VestingClaimed(msg.sender, claimable);
    }

    // ─────────────────────────────────────────────
    // Core — Withdraw Raised Funds
    // ─────────────────────────────────────────────

    function withdrawFunds() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "PresaleVault: nothing to withdraw");
        (bool ok, ) = payable(treasury).call{value: balance}("");
        require(ok, "PresaleVault: transfer failed");
        emit FundsWithdrawn(treasury, balance);
    }

    // ─────────────────────────────────────────────
    // View Helpers
    // ─────────────────────────────────────────────

    function claimableAmount(address wallet) external view returns (uint256) {
        VestingSchedule storage vs = vestingOf[wallet];
        if (vs.totalTokens == 0) return 0;
        uint256 unlocked = _unlockedAmount(vs);
        return unlocked - vs.claimedTokens;
    }

    function totalRaisedAllRounds() external view returns (uint256 total) {
        for (uint8 i = 0; i < 3; i++) total += rounds[i].totalRaised;
    }

    function totalHardcap() external view returns (uint256 cap) {
        for (uint8 i = 0; i < 3; i++) cap += rounds[i].hardcap;
    }

    function roundTimeLeft() external view returns (uint256) {
        if (!saleOpen) return 0;
        Round storage r = rounds[uint8(activeRound)];
        if (block.timestamp >= r.endTime) return 0;
        return r.endTime - block.timestamp;
    }

    function getAllRounds() external view returns (Round[3] memory) {
        return rounds;
    }

    // ─────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────

    function _verifyWhitelist(uint8 roundIndex, address wallet, bytes32[] calldata proof)
        internal view returns (bool)
    {
        bytes32 leaf = keccak256(abi.encodePacked(wallet));
        return MerkleProof.verify(proof, rounds[roundIndex].merkleRoot, leaf);
    }

    /// @dev Linear vesting using global vestingDuration (no per-user storage slot).
    ///      1-day cliff: nothing claimable within the first day of vestStart.
    function _unlockedAmount(VestingSchedule storage vs) internal view returns (uint256) {
        uint256 start = uint256(vs.vestStart);
        if (block.timestamp <= start) return 0;
        uint256 elapsed = block.timestamp - start;
        if (elapsed < 1 days) return 0;                   // 1-day cliff
        if (elapsed >= vestingDuration) return vs.totalTokens;
        return (uint256(vs.totalTokens) * elapsed) / vestingDuration;
    }

    receive() external payable {}
}
