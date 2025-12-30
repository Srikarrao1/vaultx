# VaultX Protocol

**Blockchain-based real estate NFT platform — tokenize, trade, and earn yield on premium global properties.**

> Hyper-futuristic DApp built with React 17, Moralis v1, Vite, and MUI v5.
> Deployed on Vercel · Targets Ethereum Mainnet & BNB Chain.

---

## Overview

VaultX allows investors and NFT collectors to buy fractional or whole ownership of tokenized real-world properties as ERC-721 NFTs. Each asset generates real rental yield paid monthly to the holder's wallet. Assets can be traded 24/7 on the built-in marketplace or any compatible DEX — no lockup periods.

The interface is a cyberpunk-luxury hybrid: glassmorphism panels, animated particle backgrounds, neon cyan/violet typography, and a fully responsive NFT gallery with live on-chain data via Moralis.

---

## Features

| Feature | Description |
|---------|-------------|
| NFT Property Gallery | Masonry grid, glassmorphism cards, hover-lift animations, lazy-loaded images |
| Fractional Ownership | ERC-721 tokens — own from 0.01 ETH. Metadata on IPFS |
| Real Yield | Monthly rental income auto-distributed to wallets via smart contract |
| Instant Liquidity | Trade 24/7 — no lockup. Listed on-chain marketplace |
| Token Swap | In-app 1inch DEX integration via Moralis Plugins |
| VTX Pre-Sale | Two-phase token presale with live progress bar and countdown timer |
| Staking | Stake VTX to earn protocol fees and governance rights |
| Wallet Connect | MetaMask + WalletConnect via `@web3-react/core` |
| Live Data | Moralis syncs on-chain events in real time — reactive UI |
| Particle Background | Canvas-based floating particles + scanline overlay |

---

## Tech Stack

### Frontend
- **React 17.0.2** + **Vite 7**
- **MUI v5** (Material-UI) — component library
- **react-router-dom v6** — client-side routing
- **react-moralis v1.4.2** — Moralis React hooks
- **@web3-react/core v6** — wallet connector abstraction
- **antd v5** — additional UI components
- **react-countdown** — presale timer

### Blockchain & Web3
- **ethers.js v5.7.2** — contract interaction, providers, signers
- **Moralis v1 / moralis-v1** — on-chain data, authentication, plugins
- **web3 v4** — supplementary Web3 utilities
- **@walletconnect/web3-provider** — WalletConnect bridge

### Smart Contracts
- **Solidity 0.8.x** — ERC-721 NFT, ERC-20 VTX token, Presale, Staking
- **Truffle** — compile, test, deploy framework
- **OpenZeppelin** — ReentrancyGuard, SafeMath, ERC standards

### Infrastructure
- **Vercel** — frontend hosting (`vercel.json` configured)
- **IPFS** — NFT metadata + images
- **BNB Chain Testnet** — current QA environment
- **Ethereum Mainnet** — production target

### Styling
- Custom CSS design system (`src/index.css`)
- Fonts: **Orbitron** · **Rajdhani** · **Space Mono** · **Exo 2** (Google Fonts)
- CSS variables for full theme consistency

---

## Project Structure

```
vaultx/
├── contracts/                  Smart contracts (Solidity)
│   ├── token_presale.sol       VaultX presale contract (BNB Chain)
│   ├── token.sol               VaultX ERC-20 token
│   ├── VaultXPresale.sol       Updated presale (Ethereum)
│   ├── VaultXToken.sol         Updated ERC-20 token (Ethereum)
│   └── deployed_adr            Deployed contract addresses
│
├── Truffle/                    Truffle workspace
│   ├── contracts/              Contract copies for compilation
│   ├── migrations/             Deployment scripts
│   ├── scripts/                deployContract.js · devChain.js
│   └── test/                   Unit tests (Mocha + Chai)
│
├── src/
│   ├── App.jsx                 Root router + provider tree
│   ├── index.jsx               Entry — MoralisProvider + ThemeProvider
│   ├── index.css               Global design system + animations
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header/         MainNavigation.jsx · SideDrawer.jsx · Navbar.jsx
│   │   │   └── Footer.jsx
│   │   ├── home/               HeroSection · StatsBar · FeaturesSection
│   │   │                       HowToSection · TokenomicsSection · RoadmapSection
│   │   │                       PartnersSection
│   │   ├── pre-sale/           PhaseI/ · PhaseII/ · CountingDown.jsx
│   │   ├── stake/              TokenPools.jsx · StakeSteps.jsx
│   │   ├── swap/               SwapCard.jsx · Tokens.jsx
│   │   └── ui/                 ParticleCanvas.jsx · Alert.jsx
│   │
│   ├── containers/             Page-level wrappers
│   │   ├── home/   about/   gallery/   nfts/
│   │   ├── swap/   pre-sale/   stake/
│   │   └── transactions/   mint/
│   │
│   ├── hooks/                  Custom React hooks
│   │   ├── useInchDex.js       1inch swap integration
│   │   ├── useNativeBalance.js
│   │   ├── useERC20Balance.js
│   │   ├── useNFTBalance.js
│   │   ├── useTokenPrice.js
│   │   └── useAPIContract.js
│   │
│   ├── providers/
│   │   └── MoralisDappProvider/   chainId · walletAddress context
│   │
│   ├── helpers/                formatters.js · networks.js
│   └── contracts/              ABI JSON files (ERC20, ERC721, presale)
│
├── public/                     Static assets, fonts, images
├── .env.default                Environment variable template
├── vercel.json                 Vercel deployment config
├── vite.config.js              Vite build config + polyfills
└── package.json
```

---

## Prerequisites

- **Node.js** v18+ and npm v9+
- **MetaMask** browser extension
- **Moralis account** — [admin.moralis.io](https://admin.moralis.io)
- A BSC Testnet wallet with test BNB (from [testnet faucet](https://testnet.binance.org/faucet-smart))

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/trustledgerlabs/RWA
cd RWA
```

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required due to `react-moralis v1` targeting React 17 while some packages declare React 18 peers.

### 3. Set up environment variables

```bash
cp .env.default .env
```

Edit `.env` and fill in your Moralis credentials:

```env
VITE_APP_NAME=VaultX
VITE_TOKEN_SYMBOL=VTX
VITE_MORALIS_APP_ID=your_moralis_app_id_here
VITE_MORALIS_SERVER_URL=https://your-server.moralis.io/server
```

Get `APP_ID` and `SERVER_URL` from your Moralis dashboard → Servers tab.

### 4. Run the development server

```bash
npm start
# or
npm run dev
```

App runs at `http://localhost:5173`

### 5. Build for production

```bash
npm run build
# Output in /dist — deploy via Vercel or any static host
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_APP_NAME` | No | Display name (default: VaultX) |
| `VITE_TOKEN_SYMBOL` | No | Token ticker (default: VTX) |
| `VITE_MORALIS_APP_ID` | Yes* | From Moralis Dashboard → Servers |
| `VITE_MORALIS_SERVER_URL` | Yes* | From Moralis Dashboard → Servers |

> *App loads without Moralis credentials but swap and wallet features will be disabled.

---

## Smart Contracts

### VaultX Token (ERC-20) — `VaultXToken.sol`

The VTX governance and utility token. Used for staking, fee discounts, and DAO voting.

### Presale — `token_presale.sol` / `VaultXPresale.sol`

Handles BNB/ETH deposits, token allocation, refunds, and owner withdrawals.

```
Token rate:   2,000,000 VTX per ETH
Raise min:    0.01 ETH per transaction
Raise max:    10 ETH per wallet
Softcap:      50 ETH
Hardcap:      100 ETH
```

### Deployed Addresses

| Network | Contract | Address |
|---------|----------|---------|
| BSC Testnet | Token | `0x6154818f854f5009C5CFa47213C68598E9dE02FA` |
| BSC Testnet | Presale | `0xDD1C2603315A0C1ad649819A70451D5529F53398` |
| Ethereum Mainnet | Token | TBD — pending audit |
| Ethereum Mainnet | Presale | TBD — pending audit |

### Deploy contracts

```bash
# Compile
cd Truffle
npx truffle compile

# Deploy to BSC Testnet
npm run deploy

# Run local dev chain
npm run devchain

# Watch contract events (Moralis sync)
npm run watch:events
```

---

## Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Hero, stats, features, tokenomics, roadmap |
| `/gallery` | Gallery | NFT property marketplace grid |
| `/pre-sale` | Presale | VTX token purchase with live countdown |
| `/stake` | Stake | VTX staking pools and rewards |
| `/swap` | Swap | In-app 1inch token swap |
| `/nfts` | NFTs | User's NFT portfolio |
| `/transactions` | Transactions | Wallet transaction history |
| `/mint` | Mint | Property NFT minting |
| `/about` | About | Protocol overview |

---

## Deployment

The project is configured for zero-config Vercel deployment.

```json
// vercel.json
{
  "version": 2,
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

Push to the `main` branch of your Bitbucket repo — Vercel auto-deploys on every commit.

**Required Vercel environment variables** (set in Vercel dashboard → Settings → Environment Variables):
- `VITE_MORALIS_APP_ID`
- `VITE_MORALIS_SERVER_URL`

---

## Known Dependency Constraints

These versions are pinned intentionally — do not upgrade without testing:

| Package | Pinned Version | Reason |
|---------|---------------|--------|
| `react` / `react-dom` | `17.0.2` | `react-moralis@1.x` requires React 17 |
| `react-moralis` | `^1.4.2` | Latest v1; v2 has breaking API changes |
| `moralis-v1` | `1.13.0` | Alias required — `react-moralis` imports it internally |
| `ethers` | `^5.7.2` | Codebase uses v5 API (`ethers.providers`, `ethers.utils`) |
| `@mui/material` | `^5.15.0` | MUI v7 requires React 18 |
| `react-router-dom` | `^6.26.0` | v7 requires React 18 concurrent rendering |
| `@testing-library/react` | `12.1.5` | v13+ requires React 18 |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development guide, branch naming conventions, and BSC Testnet QA checklist.

---

## License

MIT © 2025 Ztakora

---

## Acknowledgements

- [Moralis](https://moralis.io) — Web3 backend infrastructure
- [OpenZeppelin](https://openzeppelin.com) — audited smart contract standards
- [1inch](https://1inch.io) — DEX aggregation protocol
- [MUI](https://mui.com) — React component library
- [Vercel](https://vercel.com) — frontend deployment