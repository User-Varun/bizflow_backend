const Inventory = require("../models/inventoryModel");
const ProductCatalog = require("../models/productCatalogModel");
const Dealer = require("../models/dealerModel");
const AppError = require("../utilities/appError");
const { catchAsync } = require("../utilities/catchAsync");
const { Op } = require("sequelize");

exports.getInventory = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8);
  const offset = (page - 1) * pageSize;
  const search = (req.query.search || "").trim();
  const dealerId = String(req.query.dealer_id || "").trim();
  const stockStatus = String(req.query.stockStatus || "all")
    .trim()
    .toLowerCase();
  const lowStockThreshold = Math.max(
    0,
    Number.parseInt(req.query.lowStockThreshold, 10) || 10,
  );

  const where = { tenant_id: tenant.id };
  const productCatalogInclude = {
    model: ProductCatalog,
    attributes: ["id", "dealer_id"],
    required: false,
    include: [
      {
        model: Dealer,
        attributes: ["id", "name", "invoice_type"],
        required: false,
      },
    ],
  };

  if (dealerId) {
    const dealer = await Dealer.findOne({
      where: {
        id: dealerId,
        tenant_id: tenant.id,
        invoice_type: "stock_in",
      },
    });

    if (!dealer) {
      return next(new AppError("supplier not found", 404));
    }

    productCatalogInclude.required = true;
    productCatalogInclude.where = {
      tenant_id: tenant.id,
      dealer_id: dealerId,
    };
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { brand: { [Op.iLike]: `%${search}%` } },
      { hsn_code: { [Op.iLike]: `%${search}%` } },
    ];
  }

  if (stockStatus === "out_of_stock") {
    where.product_qty = { [Op.lte]: 0 };
  } else if (stockStatus === "low_stock") {
    where.product_qty = { [Op.gt]: 0, [Op.lte]: lowStockThreshold };
  }

  const { count: total, rows: inventory } = await Inventory.findAndCountAll({
    where,
    include: [productCatalogInclude],
    distinct: true,
    limit: pageSize,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const result = inventory.map((item) => {
    const plainItem = item.toJSON();
    return {
      ...plainItem,
      dealer: plainItem.product_catalog?.dealer || null,
    };
  });

  res.status(200).json({
    status: "success",
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    length: result.length,
    result,
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
