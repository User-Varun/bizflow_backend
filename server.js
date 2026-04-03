require("dotenv").config({ path: "./config.env" });
const app = require("./src/app");
const sequelize = require("./src/config/db");

const port = Number(process.env.PORT) || 8080;

async function normalizeUnitNameColumns() {
  const tables = ["product_catalogs", "inventories", "invoice_items"];

  for (const tableName of tables) {
    await sequelize.query(`
      ALTER TABLE "${tableName}"
      ALTER COLUMN "unit_name" TYPE VARCHAR(50)
      USING "unit_name"::text;
    `);
  }
}

async function normalizeStringLengthColumns() {
  const columnUpdates = [
    ["tenants", "cname", 120],
    ["tenants", "caddress", 255],
    ["tenants", "cphone_number", 20],
    ["tenants", "gstin", 20],
    ["invoices", "invoice_to", 120],
    ["invoices", "address_to", 255],
    ["invoices", "phone_to", 20],
    ["invoices", "invoice_from", 120],
    ["invoices", "address_from", 255],
    ["invoices", "phone_from", 20],
    ["invoices", "other_party_gst", 20],
    ["product_catalogs", "name", 120],
    ["product_catalogs", "brand", 120],
    ["product_catalogs", "hsn_code", 20],
    ["product_catalogs", "unit_name", 80],
    ["inventories", "name", 120],
    ["inventories", "brand", 120],
    ["inventories", "hsn_code", 20],
    ["inventories", "unit_name", 80],
    ["invoice_items", "name", 120],
    ["invoice_items", "brand", 120],
    ["invoice_items", "hsn_code", 20],
    ["invoice_items", "unit_name", 80],
  ];

  for (const [tableName, columnName, length] of columnUpdates) {
    await sequelize.query(`
      ALTER TABLE "${tableName}"
      ALTER COLUMN "${columnName}" TYPE VARCHAR(${length})
      USING "${columnName}"::text;
    `);
  }
}

async function ensureTenantPaymentColumns() {
  await sequelize.query(`
    ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "account_number" VARCHAR(34),
    ADD COLUMN IF NOT EXISTS "ifsc_code" VARCHAR(11),
    ADD COLUMN IF NOT EXISTS "qr_url" TEXT;
  `);
}

async function ensureProductCatalogRateColumn() {
  await sequelize.query(`
    ALTER TABLE "product_catalogs"
    ADD COLUMN IF NOT EXISTS "rate" DOUBLE PRECISION DEFAULT 0;
  `);

  await sequelize.query(`
    ALTER TABLE "inventories"
    ADD COLUMN IF NOT EXISTS "rate" DOUBLE PRECISION;
  `);

  await sequelize.query(`
    UPDATE "product_catalogs"
    SET "rate" = ROUND((50 + random() * 450)::numeric, 2)
    WHERE "rate" IS NULL OR "rate" <= 0;
  `);

  await sequelize.query(`
    UPDATE "inventories"
    SET "rate" = ROUND((50 + random() * 450)::numeric, 2)
    WHERE "rate" IS NULL OR "rate" <= 0;
  `);

  await sequelize.query(`
    ALTER TABLE "product_catalogs"
    ALTER COLUMN "rate" SET NOT NULL;
  `);
}

async function ensureDealerTable() {
  await sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_dealers_invoice_type" AS ENUM ('stock_in', 'stock_out');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "dealers" (
      "id" UUID PRIMARY KEY,
      "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
      "invoice_type" "enum_dealers_invoice_type" NOT NULL,
      "name" VARCHAR(120) NOT NULL,
      "address" VARCHAR(255) DEFAULT '',
      "phone" VARCHAR(20) NOT NULL,
      "gst" VARCHAR(20) DEFAULT '',
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
    );
  `);

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "dealers_tenant_invoice_name_phone_uq"
    ON "dealers" ("tenant_id", "invoice_type", "name", "phone");
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "dealers_tenant_invoice_updated_idx"
    ON "dealers" ("tenant_id", "invoice_type", "updatedAt");
  `);
}

async function ensureInvoiceDealerColumn() {
  await sequelize.query(`
    ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "dealer_id" UUID;
  `);

  await sequelize.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoices_dealer_id_fkey'
      ) THEN
        ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_dealer_id_fkey"
        FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "invoices_tenant_dealer_type_created_idx"
    ON "invoices" ("tenant_id", "dealer_id", "invoice_type", "createdAt");
  `);

  await sequelize.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "invoices" WHERE "dealer_id" IS NULL
      ) THEN
        ALTER TABLE "invoices"
        ALTER COLUMN "dealer_id" SET NOT NULL;
      END IF;
    END $$;
  `);
}

async function server() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await normalizeUnitNameColumns();
    await normalizeStringLengthColumns();
    await ensureTenantPaymentColumns();
    await ensureProductCatalogRateColumn();
    await ensureDealerTable();
    await ensureInvoiceDealerColumn();

    app.listen(port, () => {
      console.log("DB connected successfully!");
      console.log("server listening at port " + port);
    });
  } catch (err) {
    console.error("Failed to initialize server:", err.message);

    try {
      await sequelize.close();
    } catch (_closeErr) {
      // Ignore close failures during startup shutdown.
    }

    process.exit(1);
  }
}
server();
