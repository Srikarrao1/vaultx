// scripts/generateMerkle.js
// Generate Merkle root + proofs for presale whitelist rounds
// Usage: node scripts/generateMerkle.js [round]
//
// Input: whitelist/<round>.json — array of ethereum addresses
// Output: whitelist/<round>.merkle.json — { root, proofs: { address: proof[] } }

const { MerkleTree } = require("merkletreejs");
const keccak256      = require("keccak256");
const fs             = require("fs");
const path           = require("path");

const ROUND_NAMES = ["pre-seed", "seed"];

function buildTree(addresses) {
  // Normalise to checksum addresses and deduplicate
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const leaves = unique.map((a) => keccak256(a));
  const tree   = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root   = tree.getHexRoot();

  const proofs = {};
  unique.forEach((addr) => {
    proofs[addr] = tree.getHexProof(keccak256(addr));
  });

  return { root, proofs, count: unique.length };
}

function main() {
  const roundArg = process.argv[2];
  const rounds   = roundArg ? [roundArg] : ROUND_NAMES;

  for (const round of rounds) {
    const inputPath  = path.join(__dirname, `../whitelist/${round}.json`);
    const outputPath = path.join(__dirname, `../whitelist/${round}.merkle.json`);

    if (!fs.existsSync(inputPath)) {
      // Create example file
      fs.mkdirSync(path.dirname(inputPath), { recursive: true });
      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          [
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000002",
          ],
          null,
          2
        )
      );
      console.log(`⚠  Created placeholder whitelist at ${inputPath}`);
      console.log("   Replace addresses and re-run.");
      continue;
    }

    const addresses = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    if (!Array.isArray(addresses)) {
      console.error(`✗ ${inputPath} must be a JSON array of addresses`);
      continue;
    }

    const result = buildTree(addresses);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`\n✅ ${round.toUpperCase()} round`);
    console.log(`   Addresses : ${result.count}`);
    console.log(`   Root      : ${result.root}`);
    console.log(`   Output    : ${outputPath}`);
    console.log(`\n   Pass this root to openRound():`);
    console.log(`   vault.openRound(${ROUND_NAMES.indexOf(round)}, startTime, endTime, "${result.root}")`);
  }
}

main();
