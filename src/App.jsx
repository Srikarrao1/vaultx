import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useWeb3React } from '@web3-react/core';

import ERC20Balance from './components/ERC20Balance';
import Home from './containers/home';
import About from './containers/about';
import Gallery from './containers/gallery';
import Transactions from './containers/transactions';
import NFTs from './containers/nfts';

import 'antd/dist/reset.css';

import Ramper from './components/Ramper';
import Footer from './components/layout/Footer';
import MainNavigation from './components/layout/Header/MainNavigation';

import Swap from './containers/swap';
import Presale from './containers/pre-sale';
import Mint from './containers/mint';
import Stake from './containers/stake';
import VaultXPresale from '../containers/pre-sale';
import VaultXStake from '../containers/stake';


const App = () => {
  const { library, account } = useWeb3React();

  useEffect(() => {
    if (library) {
      localStorage.setItem('connected', true);
    }
  }, [library, account]);

  return (
    <BrowserRouter>
      <MainNavigation />
      <main style={{ marginTop: 90, marginBottom: 90 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/swap" element={<Swap />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/erc20balance" element={<ERC20Balance />} />
          <Route path="/onramp" element={<Ramper />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/nfts" element={<NFTs />} />
          <Route path="/pre-sale" element={<Presale />} />
          <Route path="/mint" element={<Mint />} />
          <Route path="/stake" element={<Stake />} />
          <Route path="/vaultx-presale" element={<VaultXPresale />} />
          <Route path="/vaultx-stake" element={<VaultXStake />} />

          <Route
            path="/nonauthenticated"
            element={<>Please login using the "Authenticate" button</>}
          />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
};

export default App;
