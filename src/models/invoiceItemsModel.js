const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const ProductCatalog = require("./productCatalogModel");

const InvoiceItem = sequelize.define("invoice_item", {
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
  product_catalog_id: {
    type: DataTypes.UUID,
    references: {
      model: "product_catalogs",
      key: "id",
    },
    allowNull: true,
    onDelete: "SET NULL",
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  brand: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  hsn_code: {
    type: DataTypes.STRING(50), // have to look this up (how many digits hsn_code have)
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
  product_qty: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  rate: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  cgst: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  sgst: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  discount: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  mrp: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  total_amount: {
    // this is total amount before adding gst and dicount
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  // timestamp added by default
});

module.exports = InvoiceItem;

InvoiceItem.belongsTo(ProductCatalog, { foreignKey: "product_catalog_id" });
