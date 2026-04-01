require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PK = process.env.DEPLOYER_PRIVATE_KEY ?? ("0x" + "0".repeat(64));

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat:  { chainId: 31337, hardfork: "cancun" },
    sepolia:  {
      url:      process.env.SEPOLIA_RPC_URL ?? "",
      chainId:  11155111,
      accounts: [PK],
      timeout:  120_000,
    },
    bscTestnet: {
      url:      "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId:  97,
      accounts: [PK],
      gasPrice: 10_000_000_000,
      timeout:  120_000,
    },
  },
  etherscan: {
    apiKey: {
      sepolia:    process.env.ETHERSCAN_API_KEY ?? "",
      bscTestnet: process.env.BSCSCAN_API_KEY   ?? "",
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
