import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
export const deploymentPath = path.join(root, "deployments/monad-testnet.json");
const transport = http(process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz", { timeout: 15_000 });
export const publicClient = createPublicClient({ chain: monadTestnet, transport });
export const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)", "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
export function readArtifact() {
  return JSON.parse(fs.readFileSync(path.join(root, "out/SettlementPool.sol/SettlementPool.json"), "utf8"));
}
export function loadRoleKeys() {
  if (!process.env.POOL_KEY_FILE) throw new Error("Set POOL_KEY_FILE to a private local testnet role-key file.");
  const keyPath = path.resolve(process.env.POOL_KEY_FILE);
  if ((fs.statSync(keyPath).mode & 0o077) !== 0) throw new Error("The role-key file must be private (0600).");
  const keys = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const result = {};
  for (const role of ["admin", "invoiceManager", "operator"]) {
    const account = privateKeyToAccount(keys[role].privateKey);
    if (getAddress(keys[role].address) !== account.address) throw new Error("Role address/key mismatch.");
    result[role] = account;
  }
  if (new Set(Object.values(result).map(account => account.address)).size !== 3) throw new Error("Use distinct testnet service accounts for the three roles.");
  return result;
}
export function wallet(account) {
  return createWalletClient({ account, chain: monadTestnet, transport });
}
export async function assertTestnet() {
  if (await publicClient.getChainId() !== 10143) throw new Error("Refusing to operate outside Monad TESTNET 10143.");
  const code = await publicClient.getCode({ address: USDC });
  if (!code || code === "0x") throw new Error("USDC contract missing on the selected network.");
  if (await publicClient.readContract({ address: USDC, abi: tokenAbi, functionName: "decimals" }) !== 6
    || await publicClient.readContract({ address: USDC, abi: tokenAbi, functionName: "symbol" }) !== "USDC") {
    throw new Error("USDC metadata does not match the configured test token.");
  }
}
export async function finalizedReceipt(hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 1200 });
  if (receipt.status !== "success") throw new Error("Testnet transaction reverted.");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const finalized = await publicClient.getBlock({ blockTag: "finalized" });
    if (finalized.number >= receipt.blockNumber) {
      const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash) throw new Error("Transaction block changed before finality.");
      return receipt;
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error("Finality is unknown; reconcile this transaction hash before retrying.");
}
export async function write(account, address, abi, functionName, args = []) {
  await assertTestnet();
  const request = { account, address, abi, functionName, args };
  const simulation = await publicClient.simulateContract(request);
  const estimate = await publicClient.estimateContractGas(request);
  // Monad charges the gas limit. Use only a small buffer, never an arbitrary multiple.
  const hash = await wallet(account).writeContract({ ...simulation.request, gas: estimate + estimate / 10n });
  const receipt = await finalizedReceipt(hash);
  return { hash, receipt };
}
export function sanitizedError(error) { return error.shortMessage || error.message || "Operation failed"; }
