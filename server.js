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

async function ensureTenantPaymentColumns() {
  await sequelize.query(`
    ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "account_number" VARCHAR(34),
    ADD COLUMN IF NOT EXISTS "ifsc_code" VARCHAR(11),
    ADD COLUMN IF NOT EXISTS "qr_url" TEXT;
  `);
}

async function server() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await normalizeUnitNameColumns();
    await ensureTenantPaymentColumns();

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
