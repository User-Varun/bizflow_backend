const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "user",
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      // NOT unique: true here — uniqueness is per-tenant, enforced by the composite index below
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false, // will implement using bcrypt
    },
    role: {
      type: DataTypes.ENUM("owner", "staff"),
      allowNull: false,
    },

    // timestamps createdAt, updatedAt are added by default
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["tenant_id", "email"], // same email allowed across tenants, blocked within one tenant
      },
    ],
  },
);

module.exports = User;
