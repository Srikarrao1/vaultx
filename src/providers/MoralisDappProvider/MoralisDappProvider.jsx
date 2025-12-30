import React, { useEffect, useState } from "react";
import { useMoralis } from "react-moralis";
import MoralisDappContext from "./context";

function MoralisDappProvider({ children }) {
  const { web3, user } = useMoralis();
  const [walletAddress, setWalletAddress] = useState();
  const [chainId, setChainId] = useState();

  // Listen to wallet events
  useEffect(() => {
    if (!window.ethereum) return;

    window.ethereum.on("accountsChanged", (accounts) => {
      setWalletAddress(accounts[0]);
    });

    window.ethereum.on("chainChanged", (chain) => {
      setChainId(chain);
    });
  }, []);

  // Init chainId
  useEffect(() => {
    setChainId(web3?.givenProvider?.chainId);
  }, []);

  // Init walletAddress
  useEffect(() => {
    setWalletAddress(
      web3?.givenProvider?.selectedAddress || user?.get("ethAddress")
    );
  }, [web3, user]);

  return (
    <MoralisDappContext.Provider value={{ walletAddress, chainId }}>
      {children}
    </MoralisDappContext.Provider>
  );
}

function useMoralisDapp() {
  const context = React.useContext(MoralisDappContext);
  if (context === undefined) {
    throw new Error("useMoralisDapp must be used within a MoralisDappProvider");
  }
  return context;
}

export { MoralisDappProvider, useMoralisDapp };
