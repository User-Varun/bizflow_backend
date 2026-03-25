const Inventory = require("../models/inventoryModel");
const { catchAsync } = require("../utilities/catchAsync");
const { Op } = require("sequelize");

exports.getInventory = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8);
  const offset = (page - 1) * pageSize;
  const search = (req.query.search || "").trim();

  const where = { tenant_id: tenant.id };

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { brand: { [Op.iLike]: `%${search}%` } },
      { hsn_code: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count: total, rows: inventory } = await Inventory.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [["createdAt", "DESC"]],
  });

  res.status(200).json({
    status: "success",
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
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
