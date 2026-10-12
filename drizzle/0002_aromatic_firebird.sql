CREATE TABLE "chain_locks" (
	"account" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"until" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_transactions" (
	"action" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"nonce" integer NOT NULL,
	"raw" text NOT NULL,
	"hash" text NOT NULL,
	"status" text DEFAULT 'signed' NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "chain_transactions_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "local_payments" (
	"order_id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"recipient" text NOT NULL,
	"amount" text NOT NULL,
	"base_minor" integer NOT NULL,
	"fee_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"token" text,
	"page_url" text,
	"payment_id" text,
	"payment_ref" text,
	"tx_hash" text,
	"run_id" text,
	"lease_owner" text,
	"lease_until" bigint,
	"token_expires_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"issue" text,
	CONSTRAINT "local_payments_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "local_payments_token_unique" UNIQUE("token"),
	CONSTRAINT "local_payments_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "local_payments_payment_ref_unique" UNIQUE("payment_ref"),
	CONSTRAINT "local_payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "local_payments" ADD CONSTRAINT "local_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE "orders" SET "payment_method" = 'wallet' WHERE "payer" IS NOT NULL;
