const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Inventory = sequelize.define("inventory", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tenant_id: {
    type: DataTypes.UUID,
    references: {
      model: "tenants",
      key: "id",
    },
  },
  product_catalog_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: "product_catalogs",
      key: "id",
    },
    onDelete: "SET NULL",
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  brand: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  product_qty: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  hsn_code: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  unit_name: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  unit_qty: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  mrp: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  rate: {
    type: DataTypes.DOUBLE,
    allowNull: true,
  },

  // timestamps are added by default by ORM
});

module.exports = Inventory;

const ProductCatalog = require("./productCatalogModel");

Inventory.belongsTo(ProductCatalog, { foreignKey: "product_catalog_id" });
