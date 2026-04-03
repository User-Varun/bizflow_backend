const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Tenant = sequelize.define("tenant", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  owner_user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: "users",
      key: "id",
    },
  },

  cname: {
    type: DataTypes.STRING,
  },
  caddress: {
    type: DataTypes.STRING,
  },
  cphone_number: {
    type: DataTypes.STRING,
  },
  gstin: {
    type: DataTypes.STRING,
  },
  account_number: {
    type: DataTypes.STRING(34),
    allowNull: true,
  },
  ifsc_code: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
  qr_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // adding this (coz need to identify tenant uniquely at login but don't want to expose tenant_id)
  tenant_slug: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9-]+$/i, // check for lower case
      len: [8, 80],
    },
  },
  // timestamps createdAt , updatedAt are there by default
});

module.exports = Tenant;

const User = require("./userModel");

// Tenants have many users
Tenant.hasMany(User, {
  foreignKey: "tenant_id",
});

User.belongsTo(Tenant, {
  foreignKey: "tenant_id",
});

// Tenant belongs to owner
Tenant.belongsTo(User, {
  foreignKey: "owner_user_id",
  as: "owner",
});
