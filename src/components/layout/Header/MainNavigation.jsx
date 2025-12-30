import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

import Account from "../../account";
import Networks from "../../Chains/Networks";
import Navbar from "./Navbar";
import SideDrawer from "./SideDrawer";
import Contracts from "../../shared/Contracts";

import logo from "assets/images/logo-elo.png";

const mainLinks = [{ label: "Home", href: "/" }];

const presaleLink = {
  label: "Pre-sale",
  href: "/pre-sale",
};

const comingSoonLink = ["Stake"];

const moreMenuLinks = [{ label: "About us", href: "/about" }];

const MainNavigation = () => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [contractsDialogOpen, setContractsDialogOpen] = useState(false);

  const handleContractsDialogToggle = () => {
    setContractsDialogOpen((prev) => !prev);
  };

  const handleDrawerToggle = () => {
    setMobileDrawerOpen((prev) => !prev);
  };

  return (
    <Fragment>
      <AppBar
        position="fixed"
        color="inherit"
        enableColorOnDark
        elevation={0}
        sx={{
          bgcolor: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Toolbar sx={{ borderBottom: 1, borderColor: "grey.100" }}>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo */}
          <Box sx={{ marginRight: "auto" }}>
            <Link to="/" style={{ marginRight: "auto" }}>
              <img src={logo} alt="ELO logo" width="35" />
            </Link>
          </Box>

          {/* Desktop Navbar */}
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <Navbar
              mainLinks={mainLinks}
              moreMenuLinks={moreMenuLinks}
              comingSoonLink={comingSoonLink}
              presaleLink={presaleLink}
              handleClickContracts={handleContractsDialogToggle}
            />
          </Box>

          {/* Network Selector */}
          <Box sx={{ marginLeft: "auto" }}>
            <Networks />
          </Box>

          {/* Wallet Account Button */}
          <Box sx={{ ml: 1 }}>
            <Account />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <SideDrawer
        mainLinks={mainLinks}
        presaleLink={presaleLink}
        moreMenuLinks={moreMenuLinks}
        comingSoonLink={comingSoonLink}
        onClose={handleDrawerToggle}
        open={mobileDrawerOpen}
        handleClickContracts={handleContractsDialogToggle}
      />

      {/* Contracts Dialog */}
      <Contracts
        open={contractsDialogOpen}
        handleClose={handleContractsDialogToggle}
      />
    </Fragment>
  );
};

export default MainNavigation;
