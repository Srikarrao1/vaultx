import { Link } from "react-router-dom";
import YouTube from "react-youtube";
import Stack from "@mui/material/Stack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import ReactPlayer from "react-player";

const HeroSection = () => {
  return (
    <Box
      sx={{
        width: "100%",
        py: { xs: 6, md: 10 },
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.6), rgba(240,240,255,0.4))",
        backdropFilter: "blur(10px)",
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={6}
          alignItems="center"
          justifyContent="space-between"
        >
          {/* LEFT SIDE — MAIN CONTENT */}
          <Box sx={{ maxWidth: "650px" }}>
            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                mb: 3,
                color: "primary.main",
                lineHeight: 1.2,
                textShadow: "0 2px 6px rgba(0,0,0,0.1)",
              }}
            >
              Effortless Order Foods
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              sx={{
                mb: 3,
                fontSize: "1.1rem",
                lineHeight: 1.7,
              }}
            >
              ELO is a decentralized reward system. Our ecosystem will expand
              with new reward layers and additional utility services designed to
              increase the long-term value of the token.
              <br />
              Holders of $ELO earn more rewards over time, supported by a strong
              and growing community.
            </Typography>

            <Typography
              variant="body1"
              sx={{
                fontWeight: 700,
                mb: 4,
                color: "primary.dark",
                fontSize: "1.15rem",
              }}
            >
              Let's get more and more $ELO token.
            </Typography>

            {/* BUTTONS */}
            <Stack direction="row" spacing={2}>
              <Button
                component={Link}
                to="/pre-sale"
                variant="contained"
                disableElevation
                sx={{
                  px: 3,
                  py: 1.2,
                  borderRadius: "12px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
                }}
                endIcon={<ArrowForwardIcon />}
              >
                Get ELO
              </Button>

              <Button
                component="a"
                href="" // ADD whitepaper URL
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                sx={{
                  px: 3,
                  py: 1.2,
                  borderRadius: "12px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                }}
                endIcon={<ArrowDownwardIcon />}
              >
                ELO Whitepaper
              </Button>
            </Stack>
          </Box>

          {/* RIGHT SIDE — VIDEO */}
           <Box
            sx={{
              width: { xs: "100%", md: "480px" },
              borderRadius: "20px",
              overflow: "hidden",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              background: "#000",
            }}
          >
            <YouTube
  videoId="VB5_R9_F8MY"
  opts={{
    width: "100%",
    playerVars: {
      autoplay: 0,
    },
  }}
/>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
};

export default HeroSection;
