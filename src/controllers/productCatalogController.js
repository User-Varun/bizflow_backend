// have access here to user and tenant details at req.user and req.tenant

const AppError = require("../utilities/appError");
const ProductCatalog = require("../models/productCatalogModel");
const { catchAsync } = require("../utilities/catchAsync");
const { Op } = require("sequelize");

exports.getProducts = catchAsync(async (req, res) => {
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

  const { count: total, rows: products } = await ProductCatalog.findAndCountAll(
    {
      where,
      limit: pageSize,
      offset,
      order: [["createdAt", "DESC"]],
    },
  );

  res.status(200).json({
    status: "success",
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    length: products.length,
    result: products,
  });
});
exports.getProductById = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const productId = req.params.id;

  if (!productId) throw new Error("product id is invalid!");

  const product = await ProductCatalog.findOne({
    where: { tenant_id: tenant.id, id: productId },
  });

  res.status(200).json({
    status: "success",
    result: product,
  });
});
exports.addProduct = catchAsync(async (req, res, next) => {
  // get details from req.body
  const productDetails = {
    name: req.body.name,
    brand: req.body.brand,
    mrp: req.body.mrp,
    rate: req.body.rate,
    hsn_code: req.body.hsn_code,
    unit_name: req.body.unit_name,
    unit_qty: req.body.unit_qty,
  };

  const parsedMrp = Number(productDetails.mrp);
  const parsedRate = Number(productDetails.rate);
  const parsedUnitQty = Number(productDetails.unit_qty);

  if (
    !productDetails.name ||
    !productDetails.brand ||
    !Number.isFinite(parsedMrp) ||
    parsedMrp < 0 ||
    !Number.isFinite(parsedRate) ||
    parsedRate < 0 ||
    !productDetails.hsn_code ||
    !productDetails.unit_name ||
    !Number.isFinite(parsedUnitQty) ||
    parsedUnitQty <= 0
  )
    return next(new AppError("invalid product details!", 400));

  productDetails.mrp = parsedMrp;
  productDetails.rate = parsedRate;
  productDetails.unit_qty = parsedUnitQty;

  // add tenant id to the product
  const tenantId = req.tenant.id;
  productDetails.tenant_id = tenantId;

  await ProductCatalog.sync();

  // add to the catalog
  const product = await ProductCatalog.create(productDetails);

  res.status(200).json({
    status: "sucess",
    product: product,
  });
});

exports.updateProductDetails = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const productId = req.params.id;

  if (!productId) return next(new AppError("product id is invalid!", 400));

  const productDetails = {
    name: req.body.name,
    brand: req.body.brand,
    mrp: req.body.mrp,
    rate: req.body.rate,
    hsn_code: req.body.hsn_code,
    unit_name: req.body.unit_name,
    unit_qty: req.body.unit_qty,
  };

  const parsedMrp = Number(productDetails.mrp);
  const parsedRate = Number(productDetails.rate);
  const parsedUnitQty = Number(productDetails.unit_qty);

  if (
    !productDetails.name ||
    !productDetails.brand ||
    !Number.isFinite(parsedMrp) ||
    parsedMrp < 0 ||
    !Number.isFinite(parsedRate) ||
    parsedRate < 0 ||
    !productDetails.hsn_code ||
    !productDetails.unit_name ||
    !Number.isFinite(parsedUnitQty) ||
    parsedUnitQty <= 0
  )
    return next(new AppError("invalid product details!", 400));

  productDetails.mrp = parsedMrp;
  productDetails.rate = parsedRate;
  productDetails.unit_qty = parsedUnitQty;

  const [updatedRows] = await ProductCatalog.update(productDetails, {
    where: { id: productId, tenant_id: tenant.id },
  });

  if (!updatedRows) return next(new AppError("product not found", 404));

  const product = await ProductCatalog.findOne({
    where: { id: productId, tenant_id: tenant.id },
  });

  res.status(200).json({
    status: "success",
    result: product,
  });
});

exports.deleteProductById = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const productId = req.params.id;
  if (!productId) throw new Error("product id is invalid!");

  await ProductCatalog.destroy({
    where: { id: productId, tenant_id: tenant.id },
  });

  res.status(200).send({
    status: "success",
  });
});
