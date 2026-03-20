const { Sequelize } = require("sequelize");

const connectionURI = process.env.SUPABASE_CONNECTION_STRING.replace(
  "[YOUR-PASSWORD]",
  process.env.SUPABASE_PASSWORD,
);

const sequelize = new Sequelize(connectionURI);

module.exports = sequelize;
