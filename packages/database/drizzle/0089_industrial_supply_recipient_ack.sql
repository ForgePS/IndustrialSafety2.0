-- Recipient acknowledgment on issue / PPE issue transactions.

ALTER TABLE "industrial_supply_transactions"
  ADD COLUMN IF NOT EXISTS "recipient_printed_name" varchar(255),
  ADD COLUMN IF NOT EXISTS "recipient_signature_data_url" text,
  ADD COLUMN IF NOT EXISTS "recipient_signed_at" timestamptz;
