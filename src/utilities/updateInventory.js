const Inventory = require("../models/inventoryModel");
const AppError = require("./appError");

// Updates inventory per invoice item inside the same DB transaction.
// Case 1: item exists -> increment/decrement quantity
// Case 2: item missing -> create for stock_in, reject for stock_out
exports.updateInventory = async ({
  tenantId,
  invoiceType,
  invoiceItems,
  transaction,
}) => {
  for (const item of invoiceItems) {
    let inventoryItem = null;

    if (item.product_catalog_id) {
      inventoryItem = await Inventory.findOne({
        where: {
          tenant_id: tenantId,
          product_catalog_id: item.product_catalog_id,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    if (!inventoryItem) {
      inventoryItem = await Inventory.findOne({
        where: {
          tenant_id: tenantId,
          name: item.name,
          brand: item.brand,
          hsn_code: item.hsn_code,
          unit_name: item.unit_name,
          unit_qty: item.unit_qty,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    if (inventoryItem) {
      if (invoiceType === "stock_in") {
        inventoryItem.product_qty += item.product_qty;
      }

      if (invoiceType === "stock_out") {
        if (inventoryItem.product_qty < item.product_qty) {
          throw new AppError(
            `Insufficient stock for item: ${item.name}. Available: ${inventoryItem.product_qty}, Requested: ${item.product_qty}`,
            400,
          );
        }

        inventoryItem.product_qty -= item.product_qty;
      }

      await inventoryItem.save({ transaction });
      continue;
    }

    if (invoiceType === "stock_in") {
      await Inventory.create(
        {
          tenant_id: tenantId,
          product_catalog_id: item.product_catalog_id || null,
          name: item.name,
          brand: item.brand,
          product_qty: item.product_qty,
          hsn_code: item.hsn_code,
          unit_name: item.unit_name,
          unit_qty: item.unit_qty,
          mrp: item.mrp,
        },
        { transaction },
      );
      continue;
    }

    throw new AppError(
      `cannot stock_out non-existing inventory item: ${item.name}`,
      400,
    );
  }
};
