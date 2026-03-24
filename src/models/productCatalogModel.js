const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductCatalog = sequelize.define("product_catalog", {
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
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  brand: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  mrp: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  hsn_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  unit_name: {
    type: DataTypes.ENUM("pcs", "box", "jar"),
    allowNull: false,
  },
  unit_qty: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  // timestamps are added by default by ORM
});

module.exports = ProductCatalog;

const InvoiceItem = require("./invoiceItemsModel");

ProductCatalog.hasMany(InvoiceItem, { foreignKey: "product_catalog_id" });
