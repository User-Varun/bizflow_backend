const { Sequelize } = require("sequelize");

const { SUPABASE_CONNECTION_STRING, SUPABASE_PASSWORD } = process.env;

if (!SUPABASE_CONNECTION_STRING) {
  throw new Error(
    "Missing SUPABASE_CONNECTION_STRING. Set it in config.env or .env.<env>.",
  );
}

if (!SUPABASE_PASSWORD) {
  throw new Error(
    "Missing SUPABASE_PASSWORD. Set it in config.env or .env.<env>.",
  );
}

const connectionURI = SUPABASE_CONNECTION_STRING.replace(
  "[YOUR-PASSWORD]",
  SUPABASE_PASSWORD,
);

const sequelize = new Sequelize(connectionURI)

module.exports = sequelize;
