const { DataTypes, UUIDV4 } = require("sequelize");
const sequelize = require("../config/db");

const Invoice = sequelize.define(
  "invoice",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "tenants",
        key: "id",
      },
    },

    invoice_number: {
      type: DataTypes.STRING,
      allowNull: false, // unique-ness per tenant (not global) is defined by index
    },
    invoice_type: {
      type: DataTypes.ENUM("stock_in", "stock_out"),
      allowNull: false,
    },
    invoice_to: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    address_to: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    phone_to: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    invoice_from: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    address_from: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    phone_from: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    cgst_total: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    sgst_total: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    grand_total: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    sub_total: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    pending_amount: { type: DataTypes.DOUBLE, allowNull: false },
    bill_state: {
      type: DataTypes.ENUM("pending", "partial", "paid"),
      allowNull: false,
    },
    // automatically created_at and updated_at by ORM
  },
  {
    indexes: [{ unique: true, fields: ["tenant_id", "invoice_number"] }],
  },
);

module.exports = Invoice;
