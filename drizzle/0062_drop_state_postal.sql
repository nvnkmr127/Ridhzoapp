-- State and postal code were never used by the product. Keep what owners typed: state folds into
-- city ("Guntur, Andhra Pradesh"), postal code onto the address line, then drop the columns.
UPDATE "organizations" SET "city" = left(concat_ws(', ', nullif(trim("city"), ''), nullif(trim("state"), '')), 120)
  WHERE nullif(trim("state"), '') IS NOT NULL;--> statement-breakpoint
UPDATE "organizations" SET "address_line1" = left(concat_ws(' - ', nullif(trim("address_line1"), ''), nullif(trim("postal_code"), '')), 255)
  WHERE nullif(trim("postal_code"), '') IS NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "state";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "postal_code";
