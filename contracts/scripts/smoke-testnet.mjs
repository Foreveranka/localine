import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { keccak256, stringToHex, getAddress, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { root, USDC, deploymentPath, publicClient, tokenAbi, loadRoleKeys, assertTestnet, write, sanitizedError } from "./common.mjs";

async function main() {
  if (process.env.POOL_SMOKE_TEST !== "1") throw new Error("Set POOL_SMOKE_TEST=1 to authorize test-token funding and one test payout.");
  if (!process.env.TEST_MERCHANT_KEY_FILE) throw new Error("Set TEST_MERCHANT_KEY_FILE to the private demo merchant/buyer wallet file.");
  await assertTestnet();
  const d = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const abi = JSON.parse(fs.readFileSync(path.join(root, "deployments/SettlementPool.abi.json"), "utf8"));
  const accounts = loadRoleKeys();
  const demoKeys = JSON.parse(fs.readFileSync(process.env.TEST_MERCHANT_KEY_FILE, "utf8"));
  const merchant = privateKeyToAccount(demoKeys.merchant.privateKey);
  if (getAddress(demoKeys.merchant.address) !== merchant.address) throw new Error("Demo merchant mismatch.");
  const code = await publicClient.getCode({ address: d.address });
  if (d.chainId !== 10143 || keccak256(code) !== d.runtimeCodeHash) throw new Error("Deployment bytecode/network mismatch.");
  const call = (functionName, args = []) => publicClient.readContract({ address: d.address, abi, functionName, args });
  for (const role of ["admin", "invoiceManager", "operator"]) {
    if (d[role] !== accounts[role].address) throw new Error("Deployment role mismatch.");
  }
  const journalPath = path.join(root, ".local/smoke-journal.json");
  const invoiceId = keccak256(stringToHex(`pool-smoke-invoice:${d.address}`));
  const attemptId = keccak256(stringToHex(`pool-smoke-attempt:${d.address}`));
  const paymentRef = keccak256(stringToHex(`simulated-PSP:testnet:${d.address}`));
  const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, "utf8")) : {};
  // Onchain state is checked before each mutation, so repeat runs cannot duplicate funding/payouts.
  if (await call("poolBalance") === 0n && !(await call("settlementCount"))) {
    journal.approve = (await write(merchant, USDC, tokenAbi, "approve", [d.address, 5_000_000n])).hash;
    journal.fund = (await write(merchant, d.address, abi, "fund", [5_000_000n])).hash;
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  }
  let invoice = await call("invoices", [invoiceId]);
  if (invoice[2] === 0) {
    const block = await publicClient.getBlock({ blockTag: "finalized" });
    journal.register = (await write(accounts.invoiceManager, d.address, abi, "registerInvoice", [invoiceId, merchant.address, 1_000_000n, block.timestamp + 1800n])).hash;
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  }
  invoice = await call("invoices", [invoiceId]);
  if (invoice[2] === 1) {
    journal.reserve = (await write(accounts.operator, d.address, abi, "reserve", [invoiceId, attemptId])).hash;
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  }
  invoice = await call("invoices", [invoiceId]);
  if (invoice[2] === 2) {
    assert.equal(await call("reservedTotal"), 1_000_000n);
    assert.equal(await call("availableBalance"), 4_000_000n);
    // Reserved principal cannot be withdrawn; settlement roles cannot redirect the recipient.
    await assert.rejects(publicClient.simulateContract({ account: accounts.admin, address: d.address, abi, functionName: "withdraw", args: [4_000_001n, accounts.admin.address] }));
    await assert.rejects(publicClient.simulateContract({ account: merchant, address: d.address, abi, functionName: "settle", args: [invoiceId, attemptId, paymentRef] }));
    const before = await publicClient.readContract({ address: USDC, abi: tokenAbi, functionName: "balanceOf", args: [merchant.address] });
    const { hash, receipt } = await write(accounts.operator, d.address, abi, "settle", [invoiceId, attemptId, paymentRef]);
    journal.settle = hash;
    const after = await publicClient.readContract({ address: USDC, abi: tokenAbi, functionName: "balanceOf", args: [merchant.address] });
    assert.equal(after - before, 1_000_000n);
    const events = parseEventLogs({ abi, logs: receipt.logs, eventName: "Settled" });
    assert.equal(events.length, 1);
    assert.equal(events[0].address.toLowerCase(), d.address.toLowerCase());
    assert.equal(events[0].args.invoiceId, invoiceId); assert.equal(events[0].args.recipient, merchant.address);
    assert.equal(events[0].args.amount, 1_000_000n); assert.equal(events[0].args.paymentRef, paymentRef);
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  }
  assert.equal((await call("invoices", [invoiceId]))[2], 3);
  assert.equal(await call("paymentInvoices", [paymentRef]), invoiceId);
  assert.equal(await call("reservedTotal"), 0n);
  assert.equal(await call("poolBalance"), 4_000_000n);
  assert.equal(await call("settlementCount"), 1n);
  assert.equal(await call("totalSettled"), 1_000_000n);
  await assert.rejects(publicClient.simulateContract({ account: accounts.operator, address: d.address, abi, functionName: "settle", args: [invoiceId, attemptId, paymentRef] }));
  const proof = {
    chainId: 10143, pool: d.address, token: USDC, merchant: merchant.address,
    invoiceId, attemptId, paymentRef, amount: "1000000", poolBalance: "4000000", reservedTotal: "0",
    checks: ["finalized USDC payout", "full merchant amount", "committed recipient", "reserved funds protected", "unauthorized operator rejected", "duplicate settlement rejected"],
    fiatPayment: "SIMULATED; no PSP charge was made", transactions: journal,
  };
  fs.writeFileSync(path.join(root, "deployments/monad-testnet-smoke.json"), JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify(proof, null, 2));
}
main().catch(error => { console.error(sanitizedError(error)); process.exitCode = 1; });
