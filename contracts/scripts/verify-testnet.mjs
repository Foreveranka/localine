import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { root, deploymentPath, assertTestnet, sanitizedError } from "./common.mjs";

try {
  await assertTestnet();
  const d = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (d.chainId !== 10143) throw new Error("Only Monad testnet verification is supported.");
  const constructorArgs = encodeAbiParameters(parseAbiParameters("address,address,address,address,uint256,uint256"),
    [d.token, d.admin, d.invoiceManager, d.operator, BigInt(d.maxPayment), BigInt(d.dailyLimit)]);
  const result = spawnSync(process.env.FORGE_BIN || "forge", [
    "verify-contract", d.address, "src/SettlementPool.sol:SettlementPool", "--chain", "10143",
    "--constructor-args", constructorArgs, "--verifier", "sourcify",
    "--verifier-url", "https://sourcify-api-monad.blockvision.org/", "--watch", "--retries", "3", "--delay", "3",
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(sanitizedError(error)); process.exitCode = 1; }
