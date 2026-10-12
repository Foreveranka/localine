import { pgTable, text, integer, bigint, uniqueIndex } from "drizzle-orm/pg-core";
export const orders = pgTable("orders", {
  id: text("id").primaryKey(), accessHash: text("access_hash").notNull(),
  sku: text("sku").notNull(), quantity: integer("quantity").notNull(),
  detail: text("detail").notNull(), country: text("country").notNull(),
  payer: text("payer"), amount: text("amount").notNull(),
  paymentMethod: text("payment_method"),
  createdBlock: integer("created_block").notNull(), createdAt: bigint("created_at", {mode:"number"}).notNull(),
  expiresAt: bigint("expires_at", {mode:"number"}).notNull(), status: text("status").notNull().default("unpaid"),
  txHash: text("tx_hash").unique(), paidAt: bigint("paid_at", {mode:"number"}),
});
export const localPayments = pgTable("local_payments", {
  orderId: text("order_id").primaryKey().references(()=>orders.id),
  attemptId: text("attempt_id").notNull().unique(),
  recipient: text("recipient").notNull(), amount: text("amount").notNull(),
  baseMinor: integer("base_minor").notNull(), feeMinor: integer("fee_minor").notNull(), totalMinor: integer("total_minor").notNull(),
  status: text("status").notNull().default("preparing"),
  token: text("token").unique(), pageUrl: text("page_url"), paymentId: text("payment_id").unique(),
  paymentRef: text("payment_ref").unique(), txHash: text("tx_hash").unique(),
  runId: text("run_id"), leaseOwner: text("lease_owner"), leaseUntil: bigint("lease_until",{mode:"number"}),
  tokenExpiresAt: bigint("token_expires_at",{mode:"number"}),
  createdAt: bigint("created_at",{mode:"number"}).notNull(), updatedAt: bigint("updated_at",{mode:"number"}).notNull(),
  issue: text("issue"),
});
export const chainTransactions = pgTable("chain_transactions", {
  action: text("action").primaryKey(), account: text("account").notNull(), nonce: integer("nonce").notNull(),
  raw: text("raw").notNull(), hash: text("hash").notNull().unique(),
  status: text("status").notNull().default("signed"), createdAt: bigint("created_at",{mode:"number"}).notNull(),
},table=>[uniqueIndex("chain_account_nonce_unique").on(table.account,table.nonce)]);
export const chainLocks = pgTable("chain_locks", {
  account: text("account").primaryKey(), owner: text("owner").notNull(), until: bigint("until",{mode:"number"}).notNull(),
});
