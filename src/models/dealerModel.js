const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Dealer = sequelize.define(
  "dealer",
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
      onDelete: "CASCADE",
    },
    invoice_type: {
      type: DataTypes.ENUM("stock_in", "stock_out"),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "",
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    gst: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "",
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["tenant_id", "invoice_type", "name", "phone"],
      },
      {
        fields: ["tenant_id", "invoice_type", "updatedAt"],
      },
    ],
  },
);

module.exports = Dealer;
