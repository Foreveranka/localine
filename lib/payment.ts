import merchant from "./merchant.json";
export const CHAIN_ID = 10143;
export const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
export const MERCHANT = merchant.address;
export const RPCS = ["https://testnet-rpc.monad.xyz", "https://rpc-testnet.monadinfra.com"];
export const EXPLORER = "https://testnet.monadscan.com";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const CATALOG = [
  { id: "goods", service: "Concierge", title: "Personal shopping request", description: "Goods, electronics, watches and hard-to-find items.", image: "/reference/concierge.webp", price: "1.00", units: "1000000" },
  { id: "travel", service: "Travel concierge", title: "Travel planning request", description: "Flights, custom itineraries and private travel.", image: "/reference/travel.webp", price: "2.00", units: "2000000" },
  { id: "cars", service: "Cars", title: "Vehicle sourcing request", description: "New, pre-owned and luxury vehicles.", image: "/reference/car.webp", price: "3.00", units: "3000000" },
] as const;
export function transferData(id: string, amount: string) {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d+$/.test(amount)) throw new Error("Invalid invoice");
  // Circle FiatToken accepts trailing bytes; append the invoice ID to bind payment.
  // Confirmed with eth_call against the official Monad testnet deployment.
  return "0xa9059cbb" + MERCHANT.slice(2).toLowerCase().padStart(64, "0") + BigInt(amount).toString(16).padStart(64, "0") + id;
}
export interface Receipt { status: string; blockNumber: string; blockHash: string; transactionHash: string; logs: { address: string; topics: string[]; data: string }[] }
export interface Transaction { from: string; to: string; input: string; blockHash: string; hash: string }
export interface Block { number: string; hash: string; timestamp: string }
export function checkPayment(order: {id: string; payer: string|null; amount: string; createdBlock: number; createdAt: number; expiresAt: number}, hash: string, receipt: Receipt, tx: Transaction, block: Block, finalized: Block) {
  const same = (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase();
  if (!order.payer) throw new Error("A payer must be bound before this invoice can be paid from a wallet.");
  if (receipt.status !== "0x1") throw new Error("Transaction reverted; no payment was accepted.");
  if (!same(receipt.transactionHash, hash) || !same(tx.hash, hash)) throw new Error("Transaction hash mismatch.");
  if (!same(tx.to, USDC) || !same(tx.from, order.payer)) throw new Error("Payment token or payer does not match this invoice.");
  if (!same(tx.input, transferData(order.id, order.amount))) throw new Error("Amount, recipient or order ID does not match this invoice.");
  if (!same(receipt.blockHash, block.hash) || !same(tx.blockHash, block.hash)) throw new Error("Transaction is not in the canonical block.");
  if (BigInt(finalized.number) < BigInt(receipt.blockNumber)) throw new Error("Payment is awaiting network finality. Try again shortly.");
  if (BigInt(receipt.blockNumber) < BigInt(order.createdBlock)) throw new Error("Payment predates this invoice.");
  const timestamp = Number(BigInt(block.timestamp)) * 1000;
  if (timestamp < order.createdAt - 2000 || timestamp > order.expiresAt) throw new Error("Payment was made outside this invoice's payment window.");
  const from = order.payer.slice(2).toLowerCase().padStart(64, "0"), to = MERCHANT.slice(2).toLowerCase().padStart(64, "0");
  if (!receipt.logs.some(log => same(log.address, USDC) && log.topics.length === 3 && same(log.topics[0], TRANSFER_TOPIC) && same(log.topics[1], "0x"+from) && same(log.topics[2], "0x"+to) && BigInt(log.data) === BigInt(order.amount))) throw new Error("The expected USDC transfer was not found.");
}
