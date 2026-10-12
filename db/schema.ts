import { pgTable, text, integer, bigint } from "drizzle-orm/pg-core";
export const orders = pgTable("orders", {
  id: text("id").primaryKey(), accessHash: text("access_hash").notNull(),
  sku: text("sku").notNull(), quantity: integer("quantity").notNull(),
  detail: text("detail").notNull(), country: text("country").notNull(),
  payer: text("payer"), amount: text("amount").notNull(),
  createdBlock: integer("created_block").notNull(), createdAt: bigint("created_at", {mode:"number"}).notNull(),
  expiresAt: bigint("expires_at", {mode:"number"}).notNull(), status: text("status").notNull().default("unpaid"),
  txHash: text("tx_hash").unique(), paidAt: bigint("paid_at", {mode:"number"}),
});
