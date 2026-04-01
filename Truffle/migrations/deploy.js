// scripts/deploy.js
// Deployment script for PresaleVault + VaultXToken + VaultXStaking
// Targets: Goerli (ETH) & BSC Testnet
//
// Usage:
//   npx hardhat run scripts/deploy.js --network goerli
//   npx hardhat run scripts/deploy.js --network bscTestnet
//
// Env vars required in .env:
//   DEPLOYER_PRIVATE_KEY — wallet with testnet ETH/BNB for gas
//   TREASURY_ADDRESS     — multi-sig or EOA to receive presale funds
//   ETHERSCAN_API_KEY    — for goerli verification
//   BSCSCAN_API_KEY      — for bscTestnet verification

const { ethers, run, network } = require("hardhat");
const path                     = require("path");
const fs                       = require("fs");

// ─── Network Config ──────────────────────────────────────────────────────────

const NETWORK_CONFIG = {
  goerli: {
    name          : "Goerli (ETH Testnet)",
    blocksPerYear : 2_628_000,    // ~12s blocks
    explorerBase  : "https://goerli.etherscan.io",
    verifyScript  : "etherscan",
  },
  bscTestnet: {
    name          : "BSC Testnet",
    blocksPerYear : 10_512_000,   // ~3s blocks
    explorerBase  : "https://testnet.bscscan.com",
    verifyScript  : "bscscan",
  },
  localhost: {
    name          : "Localhost (Hardhat)",
    blocksPerYear : 2_628_000,
    explorerBase  : "",
    verifyScript  : null,
  },
  hardhat: {
    name          : "Hardhat (in-process)",
    blocksPerYear : 2_628_000,
    explorerBase  : "",
    verifyScript  : null,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function verify(address, constructorArgs) {
  const cfg = NETWORK_CONFIG[network.name];
  if (!cfg?.verifyScript) {
    console.log("  ↳ Skipping verification on", network.name);
    return;
  }

  console.log(`\n⏳ Verifying ${address} on ${cfg.name}…`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`✅ Verified: ${cfg.explorerBase}/address/${address}#code`);
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log("  Already verified.");
    } else {
      console.warn("  Verification failed:", e.message);
    }
  }
}

function saveDeployment(data) {
  const dir  = path.join(__dirname, "../deployments");
  const file = path.join(dir, `${network.name}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`\n📄 Deployment saved → deployments/${network.name}.json`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);
  const cfg        = NETWORK_CONFIG[network.name] ?? NETWORK_CONFIG.localhost;

  const treasury = process.env.TREASURY_ADDRESS ?? deployer.address;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  VaultX Presale Deployment — ${cfg.name}`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Network    : ${network.name}`);
  console.log(`  Deployer   : ${deployer.address}`);
  console.log(`  Balance    : ${ethers.formatEther(balance)} native`);
  console.log(`  Treasury   : ${treasury}`);

  // ── 1. VaultXToken ──────────────────────────────────────────────────────────

  console.log("\n📦 Deploying VaultXToken…");
  const Token = await ethers.getContractFactory("VaultXToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`  ✅ VaultXToken: ${tokenAddress}`);

  // ── 2. PresaleVault ─────────────────────────────────────────────────────────

  console.log("\n📦 Deploying PresaleVault…");
  const Vault = await ethers.getContractFactory("PresaleVault");
  const vault = await Vault.deploy(tokenAddress, treasury, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`  ✅ PresaleVault: ${vaultAddress}`);

  // ── 3. VaultXStaking ────────────────────────────────────────────────────────

  console.log("\n📦 Deploying VaultXStaking…");
  const Staking = await ethers.getContractFactory("VaultXStaking");
  const staking = await Staking.deploy(tokenAddress, treasury, deployer.address);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log(`  ✅ VaultXStaking: ${stakingAddress}`);

  // ── 4. Wire permissions ─────────────────────────────────────────────────────

  console.log("\n🔑 Setting minter permissions…");
  let tx;

  tx = await token.setMinter(vaultAddress, true);
  await tx.wait();
  console.log(`  ✅ PresaleVault set as VaultXToken minter`);

  tx = await token.setMinter(stakingAddress, true);
  await tx.wait();
  console.log(`  ✅ VaultXStaking set as VaultXToken minter`);

  // ── 5. Configure staking blocks-per-year for network ───────────────────────

  if (cfg.blocksPerYear !== 2_628_000) {
    console.log(`\n⚙️  Updating blocksPerYear → ${cfg.blocksPerYear}…`);
    tx = await staking.setBlocksPerYear(cfg.blocksPerYear);
    await tx.wait();
    console.log("  ✅ Done");
  }

  // ── 6. Save deployment artifact ────────────────────────────────────────────

  const deployment = {
    network        : network.name,
    chainId        : (await ethers.provider.getNetwork()).chainId.toString(),
    deployer       : deployer.address,
    treasury       : treasury,
    deployedAt     : new Date().toISOString(),
    contracts      : {
      VaultXToken   : tokenAddress,
      PresaleVault  : vaultAddress,
      VaultXStaking : stakingAddress,
    },
    config: {
      blocksPerYear : cfg.blocksPerYear,
    },
  };

  saveDeployment(deployment);

  // ── 7. Etherscan / BscScan verification ─────────────────────────────────────

  if (cfg.verifyScript) {
    console.log("\n🔍 Waiting 6 blocks for indexer…");
    // wait for a few blocks so the explorer indexes the contracts
    for (let i = 0; i < 6; i++) {
      await ethers.provider.waitForTransaction(
        (await ethers.provider.getBlock("latest")).hash
      );
    }

    await verify(tokenAddress,   [deployer.address]);
    await verify(vaultAddress,   [tokenAddress, treasury, deployer.address]);
    await verify(stakingAddress, [tokenAddress, treasury, deployer.address]);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║              Deployment Complete             ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  VaultXToken   : ${tokenAddress}`);
  console.log(`║  PresaleVault  : ${vaultAddress}`);
  console.log(`║  VaultXStaking : ${stakingAddress}`);
  console.log("╚══════════════════════════════════════════════╝");

  // ── Post-deploy checklist ───────────────────────────────────────────────────
  console.log(`
📋 Next steps:
  1. Generate Merkle root for pre-seed / seed whitelists
  2. vault.openRound(0, startTime, endTime, merkleRoot)  ← pre-seed
  3. Update containers/pre-sale and .env with contract addresses
  4. Run slither against deployed bytecode
  5. Transfer ownership to multi-sig: vault.transferOwnership(MULTISIG)
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
