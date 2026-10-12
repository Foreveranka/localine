CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"access_hash" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"detail" text NOT NULL,
	"country" text NOT NULL,
	"payer" text NOT NULL,
	"amount" text NOT NULL,
	"created_block" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"tx_hash" text,
	"paid_at" bigint,
	CONSTRAINT "orders_tx_hash_unique" UNIQUE("tx_hash")
);
