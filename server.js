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

async function server() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await normalizeUnitNameColumns();
    await normalizeStringLengthColumns();
    await ensureTenantPaymentColumns();
    await ensureProductCatalogRateColumn();

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
