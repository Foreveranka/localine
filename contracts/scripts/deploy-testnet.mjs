import fs from "node:fs";
import path from "node:path";
import { encodeDeployData, getContractAddress, keccak256 } from "viem";
import { root, USDC, publicClient, deploymentPath, readArtifact, loadRoleKeys, wallet, assertTestnet, finalizedReceipt, sanitizedError } from "./common.mjs";

async function main() {
  await assertTestnet();
  if (fs.existsSync(deploymentPath)) throw new Error("A testnet deployment is already recorded. Inspect it instead of silently redeploying.");
  const artifact = readArtifact();
  const accounts = loadRoleKeys();
  const args = [USDC, accounts.admin.address, accounts.invoiceManager.address, accounts.operator.address, 15_000_000n, 100_000_000n];
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
  const sourceHash = keccak256(data);
  const journalDir = path.join(root, ".local");
  fs.mkdirSync(journalDir, { recursive: true, mode: 0o700 });
  const journalPath = path.join(journalDir, "deploy-journal.json");
  let journal;
  if (fs.existsSync(journalPath)) {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    if (journal.sourceHash !== sourceHash || journal.admin !== accounts.admin.address || journal.chainId !== 10143) {
      throw new Error("Existing deployment journal does not match this build. Reconcile it before changing the deployment.");
    }
  } else {
    const gas = await publicClient.estimateGas({ account: accounts.admin, data });
    const request = await wallet(accounts.admin).prepareTransactionRequest({ account: accounts.admin, data, gas: gas + gas / 10n });
    const rawTransaction = await accounts.admin.signTransaction(request);
    journal = {
      chainId: 10143, admin: accounts.admin.address, sourceHash, rawTransaction,
      transactionHash: keccak256(rawTransaction),
      contractAddress: getContractAddress({ from: accounts.admin.address, nonce: BigInt(request.nonce) }),
    };
    // Persist the signed transaction/hash BEFORE broadcast, so an ambiguous network response
    // cannot create a second pool on the next run. Never store or print private keys here.
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  }
  let existing;
  try { existing = await publicClient.getTransactionReceipt({ hash: journal.transactionHash }); } catch {}
  if (!existing) {
    try { await publicClient.sendRawTransaction({ serializedTransaction: journal.rawTransaction }); }
    catch (error) {
      console.error("Broadcast response uncertain; checking the saved transaction hash.", sanitizedError(error));
    }
  }
  const receipt = await finalizedReceipt(journal.transactionHash);
  if (receipt.contractAddress?.toLowerCase() !== journal.contractAddress.toLowerCase()) throw new Error("Unexpected contract address.");
  const address = receipt.contractAddress;
  const read = functionName => publicClient.readContract({ address, abi: artifact.abi, functionName });
  if (await read("owner") !== accounts.admin.address || await read("invoiceManager") !== accounts.invoiceManager.address
    || await read("operator") !== accounts.operator.address || (await read("usdc")).toLowerCase() !== USDC.toLowerCase()
    || await read("maxPayment") !== args[4] || await read("dailyLimit") !== args[5]) throw new Error("Deployed configuration mismatch.");
  const code = await publicClient.getCode({ address });
  const deployment = {
    chainId: 10143, network: "Monad Testnet", token: USDC, tokenDecimals: 6, address,
    admin: accounts.admin.address, invoiceManager: accounts.invoiceManager.address, operator: accounts.operator.address,
    maxPayment: args[4].toString(), dailyLimit: args[5].toString(),
    transactionHash: journal.transactionHash, blockNumber: receipt.blockNumber.toString(),
    compiler: "0.8.35", evmVersion: "osaka", foundryVersion: "1.8.5", sourceHash, runtimeCodeHash: keccak256(code),
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(path.join(root, "deployments/SettlementPool.abi.json"), JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(JSON.stringify(deployment, null, 2));
}
main().catch(error => { console.error(sanitizedError(error)); process.exitCode = 1; });
