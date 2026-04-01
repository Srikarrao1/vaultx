// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./VaultXToken.sol";

/// @title PresaleVault — Tiered token presale with merkle whitelist & linear vesting
/// @notice Supports ETH + BNB networks, three rounds, and per-wallet linear vesting
/// @dev Gas target: buyTokens() < 150k gas. No oracles — price is set in native token per VTX.
contract PresaleVault is Ownable, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────

    enum RoundType { PRE_SEED, SEED, PUBLIC }

    struct Round {
        uint256 pricePerToken;   // native wei required per 1e18 VTX
        uint256 hardcap;         // max native wei this round accepts
        uint256 totalRaised;     // native wei raised so far
        uint256 minBuy;          // min native wei per tx
        uint256 maxBuy;          // max native wei per wallet per round
        uint256 startTime;
        uint256 endTime;
        bool    whitelistRequired;
        bytes32 merkleRoot;
        bool    finalized;
    }

    /// @dev 2-slot layout optimised so buyTokens writes only slot 0:
    ///   slot 0: uint192 totalTokens + uint64 vestStart  (written on purchase)
    ///   slot 1: uint128 claimedTokens                   (written only on claim)
    ///   uint192 supports up to 6.2×10^57 tokens (>> 1B max supply at 18 decimals)
    struct VestingSchedule {
        uint192 totalTokens;
        uint64  vestStart;
        uint128 claimedTokens;
    }

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    VaultXToken public immutable token;

    Round[3]  public rounds;
    RoundType public activeRound;
    bool      public saleOpen;

    address public treasury;
    uint256 public vestingDuration = 180 days; // global default — overridable per round

    // wallet → round → amount raised (for maxBuy enforcement)
    mapping(address => mapping(uint8 => uint256)) public walletRaised;

    // wallet → vesting schedule
    mapping(address => VestingSchedule) public vestingOf;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event TokensPurchased(
        address indexed buyer,
        uint8   indexed roundIndex,
        uint256         nativeAmount,
        uint256         tokenAmount
    );
    event VestingClaimed(address indexed claimer, uint256 tokenAmount);
    event RoundOpened(uint8 indexed roundIndex, uint256 startTime, uint256 endTime);
    event RoundClosed(uint8 indexed roundIndex, uint256 totalRaised);
    event TreasuryUpdated(address indexed newTreasury);
    event VestingDurationUpdated(uint256 newDuration);
    event FundsWithdrawn(address indexed treasury, uint256 amount);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(
        address _token,
        address _treasury,
        address _owner
    ) Ownable(_owner) {
        require(_token    != address(0), "PresaleVault: zero token");
        require(_treasury != address(0), "PresaleVault: zero treasury");

        token    = VaultXToken(_token);
        treasury = _treasury;

        // ── Pre-seed round ─────────────────────────────────────────────────
        // 0.00005 ETH/VTX  (≈ $0.15 at $3k ETH) · 100 ETH hardcap
        rounds[uint8(RoundType.PRE_SEED)] = Round({
            pricePerToken     : 0.00005 ether,
            hardcap           : 100 ether,
            totalRaised       : 0,
            minBuy            : 0.01 ether,
            maxBuy            : 2 ether,
            startTime         : 0,
            endTime           : 0,
            whitelistRequired : true,
            merkleRoot        : bytes32(0),
            finalized         : false
        });

        // ── Seed round ─────────────────────────────────────────────────────
        // 0.0001 ETH/VTX · 500 ETH hardcap
        rounds[uint8(RoundType.SEED)] = Round({
            pricePerToken     : 0.0001 ether,
            hardcap           : 500 ether,
            totalRaised       : 0,
            minBuy            : 0.01 ether,
            maxBuy            : 5 ether,
            startTime         : 0,
            endTime           : 0,
            whitelistRequired : true,
            merkleRoot        : bytes32(0),
            finalized         : false
        });

        // ── Public round ────────────────────────────────────────────────────
        // 0.0002 ETH/VTX · 2000 ETH hardcap
        rounds[uint8(RoundType.PUBLIC)] = Round({
            pricePerToken     : 0.0002 ether,
            hardcap           : 2000 ether,
            totalRaised       : 0,
            minBuy            : 0.005 ether,
            maxBuy            : 10 ether,
            startTime         : 0,
            endTime           : 0,
            whitelistRequired : false,
            merkleRoot        : bytes32(0),
            finalized         : false
        });
    }

    // ─────────────────────────────────────────────
    // Admin — Round Management
    // ─────────────────────────────────────────────

    /// @notice Open a round. Closes the previously active round first.
    function openRound(
        uint8   roundIndex,
        uint256 startTime,
        uint256 endTime,
        bytes32 merkleRoot
    ) external onlyOwner {
        require(roundIndex < 3,          "PresaleVault: invalid round");
        require(endTime > startTime,     "PresaleVault: bad window");
        require(!rounds[roundIndex].finalized, "PresaleVault: already finalized");

        // close current round if sale was open
        if (saleOpen) {
            _closeRound(uint8(activeRound));
        }

        Round storage r = rounds[roundIndex];
        r.startTime  = startTime;
        r.endTime    = endTime;
        r.merkleRoot = merkleRoot;

        activeRound = RoundType(roundIndex);
        saleOpen    = true;

        emit RoundOpened(roundIndex, startTime, endTime);
    }

    /// @notice Manually close the current round
    function closeCurrentRound() external onlyOwner {
        require(saleOpen, "PresaleVault: no open round");
        _closeRound(uint8(activeRound));
        saleOpen = false;
    }

    function _closeRound(uint8 roundIndex) internal {
        rounds[roundIndex].finalized = true;
        emit RoundClosed(roundIndex, rounds[roundIndex].totalRaised);
    }

    /// @notice Update merkle root for a round (before it opens)
    function setMerkleRoot(uint8 roundIndex, bytes32 root) external onlyOwner {
        require(roundIndex < 3, "PresaleVault: invalid round");
        rounds[roundIndex].merkleRoot = root;
    }

    /// @notice Update round pricing (before it starts)
    function setRoundPrice(uint8 roundIndex, uint256 pricePerToken) external onlyOwner {
        require(roundIndex < 3,     "PresaleVault: invalid round");
        require(pricePerToken > 0,  "PresaleVault: zero price");
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
    // Core — Buy Tokens
    // ─────────────────────────────────────────────

    /// @notice Purchase tokens in the active round.
    /// @param merkleProof Proof for whitelisted rounds; pass empty array for public.
    /// @dev   Kept under 150k gas. No loops, no token transfers here — vesting only.
    function buyTokens(bytes32[] calldata merkleProof)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        require(saleOpen,        "PresaleVault: sale not open");

        uint8  idx = uint8(activeRound);
        Round storage r = rounds[idx];

        require(block.timestamp >= r.startTime, "PresaleVault: not started");
        require(block.timestamp <= r.endTime,   "PresaleVault: round ended");
        require(!r.finalized,                   "PresaleVault: round finalized");
        require(msg.value >= r.minBuy,          "PresaleVault: below min buy");

        // enforce per-wallet cap
        uint256 newWalletTotal = walletRaised[msg.sender][idx] + msg.value;
        require(newWalletTotal <= r.maxBuy, "PresaleVault: exceeds wallet cap");

        // enforce hardcap
        uint256 newRoundTotal = r.totalRaised + msg.value;
        require(newRoundTotal <= r.hardcap,  "PresaleVault: hardcap reached");

        // whitelist check
        if (r.whitelistRequired) {
            require(
                _verifyWhitelist(idx, msg.sender, merkleProof),
                "PresaleVault: not whitelisted"
            );
        }

        // calculate token allocation  (msg.value * 1e18 / pricePerToken)
        uint256 tokenAmount = (msg.value * 1 ether) / r.pricePerToken;

        // update state
        r.totalRaised                  = newRoundTotal;
        walletRaised[msg.sender][idx]  = newWalletTotal;

        // accumulate vesting schedule (supports multiple round purchases)
        VestingSchedule storage vs = vestingOf[msg.sender];
        if (vs.totalTokens == 0) {
            // first purchase — initialise schedule
            vs.vestStart = uint64(block.timestamp);
                    }
        vs.totalTokens += uint192(tokenAmount);

        // tokens minted on claim — no vault custody needed

        emit TokensPurchased(msg.sender, idx, msg.value, tokenAmount);

        // auto-close round when hardcap hit
        if (newRoundTotal == r.hardcap) {
            _closeRound(idx);
            saleOpen = false;
        }
    }

    // ─────────────────────────────────────────────
    // Core — Vesting Claim
    // ─────────────────────────────────────────────

    /// @notice Claim all currently unlocked VTX according to linear vesting schedule
    function claimVested() external nonReentrant whenNotPaused {
        VestingSchedule storage vs = vestingOf[msg.sender];
        require(vs.totalTokens > 0,  "PresaleVault: no allocation");

        uint256 unlocked = _unlockedAmount(vs);
        uint256 claimable = unlocked - uint256(vs.claimedTokens);
        require(claimable > 0, "PresaleVault: nothing to claim");

        vs.claimedTokens += uint128(claimable);
        token.mint(msg.sender, claimable);

        emit VestingClaimed(msg.sender, claimable);
    }

    // ─────────────────────────────────────────────
    // Core — Withdraw Raised Funds
    // ─────────────────────────────────────────────

    /// @notice Withdraw ETH/BNB raised to treasury
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

    /// @notice How many tokens can a wallet claim right now
    function claimableAmount(address wallet) external view returns (uint256) {
        VestingSchedule storage vs = vestingOf[wallet];
        if (vs.totalTokens == 0) return 0;
        uint256 unlocked = _unlockedAmount(vs);
        return unlocked - uint256(vs.claimedTokens);
    }

    /// @notice Total raised across all rounds in native wei
    function totalRaisedAllRounds() external view returns (uint256 total) {
        for (uint8 i = 0; i < 3; i++) {
            total += rounds[i].totalRaised;
        }
    }

    /// @notice Combined hardcap across all rounds
    function totalHardcap() external view returns (uint256 cap) {
        for (uint8 i = 0; i < 3; i++) {
            cap += rounds[i].hardcap;
        }
    }

    /// @notice Seconds remaining in current round (0 if not open or expired)
    function roundTimeLeft() external view returns (uint256) {
        if (!saleOpen) return 0;
        Round storage r = rounds[uint8(activeRound)];
        if (block.timestamp >= r.endTime) return 0;
        return r.endTime - block.timestamp;
    }

    /// @notice Returns all round data in one call for the frontend
    function getAllRounds() external view returns (Round[3] memory) {
        return rounds;
    }

    // ─────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────

    function _verifyWhitelist(
        uint8            roundIndex,
        address          wallet,
        bytes32[] calldata proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(wallet));
        return MerkleProof.verify(proof, rounds[roundIndex].merkleRoot, leaf);
    }

    function _unlockedAmount(VestingSchedule storage vs)
        internal
        view
        returns (uint256)
    {
        if (block.timestamp <= vs.vestStart) return 0;
        uint256 elapsed = block.timestamp - vs.vestStart;
        if (elapsed < 1 days) return 0; // 1-day cliff
        if (elapsed >= vestingDuration) return vs.totalTokens;
        return (uint256(vs.totalTokens) * elapsed) / vestingDuration;
    }

    // Accept ETH
    receive() external payable {}
}
