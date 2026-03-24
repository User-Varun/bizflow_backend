const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Payment = sequelize.define("payment", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  invoice_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "invoices",
      key: "id",
    },
    onDelete: "CASCADE",
  },
  amount: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  payment_method: {
    type: DataTypes.ENUM("cash", "online", "check"), // will update this as requested
    defaultValue: "cash",
  },
  // timestamps are added by default
});

module.exports = Payment;
