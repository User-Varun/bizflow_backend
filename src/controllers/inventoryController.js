const Inventory = require("../models/inventoryModel");
const { catchAsync } = require("../utilities/catchAsync");

exports.getInventory = catchAsync(async (req, res, next) => {
  // implement pagination (8 per request)

  const tenant = req.tenant;

  const inventory = await Inventory.findAll({
    where: { tenant_id: tenant.id },
  });

  res.status(200).json({
    status: "success",
    length: inventory.length,
    result: inventory,
  });
});

exports.getInventoryById = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const inventoryProductId = req.params.id;

  const inventory = await Inventory.findOne({
    where: { tenant_id: tenant.id, id: inventoryProductId },
  });

  res.status(200).json({
    status: "success",
    result: inventory,
  });
});
