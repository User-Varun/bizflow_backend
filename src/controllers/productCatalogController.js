// have access here to user and tenant details at req.user and req.tenant

const AppError = require("../utilities/appError");
const ProductCatalog = require("../models/productCatalogModel");
const Inventory = require("../models/inventoryModel");
const Dealer = require("../models/dealerModel");
const { catchAsync } = require("../utilities/catchAsync");
const { Op } = require("sequelize");

async function resolveSupplierDealer({ tenantId, dealerId }) {
  return Dealer.findOne({
    where: {
      id: dealerId,
      tenant_id: tenantId,
      invoice_type: "stock_in",
    },
  });
}

function normalizePayload(payload = {}) {
  return {
    dealer_id: String(payload.dealer_id || "").trim(),
    name: String(payload.name || "").trim(),
    brand: String(payload.brand || "").trim(),
    mrp: payload.mrp,
    rate: payload.rate,
    hsn_code: String(payload.hsn_code || "").trim(),
    unit_name: String(payload.unit_name || "").trim(),
    unit_qty: payload.unit_qty,
  };
}

function validateAndCastPayload(productDetails) {
  const parsedMrp = Number(productDetails.mrp);
  const parsedRate = Number(productDetails.rate);
  const parsedUnitQty = Number(productDetails.unit_qty);

  if (
    !productDetails.dealer_id ||
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
  ) {
    throw new AppError("invalid product details!", 400);
  }

  return {
    ...productDetails,
    mrp: parsedMrp,
    rate: parsedRate,
    unit_qty: parsedUnitQty,
  };
}

exports.getProducts = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8);
  const offset = (page - 1) * pageSize;
  const search = (req.query.search || "").trim();
  const dealerId = String(req.query.dealer_id || "").trim();

  const where = { tenant_id: tenant.id };

  if (dealerId) {
    const supplierDealer = await resolveSupplierDealer({
      tenantId: tenant.id,
      dealerId,
    });

    if (!supplierDealer) {
      return next(new AppError("invalid supplier dealer filter", 400));
    }

    where.dealer_id = supplierDealer.id;
  }

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
      include: [
        {
          model: Dealer,
          attributes: ["id", "name", "phone", "gst"],
          required: false,
        },
      ],
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
    meta: {
      dealer_id: dealerId || null,
    },
  });
});
exports.getProductById = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const productId = req.params.id;

  if (!productId) return next(new AppError("product id is invalid!", 400));

  const product = await ProductCatalog.findOne({
    where: { tenant_id: tenant.id, id: productId },
    include: [
      {
        model: Dealer,
        attributes: ["id", "name", "phone", "gst"],
        required: false,
      },
    ],
  });

  if (!product) return next(new AppError("product not found", 404));

  res.status(200).json({
    status: "success",
    result: product,
  });
});
exports.addProduct = catchAsync(async (req, res, next) => {
  const tenantId = req.tenant.id;
  let productDetails;

  try {
    productDetails = validateAndCastPayload(normalizePayload(req.body));
  } catch (err) {
    return next(err);
  }

  const supplierDealer = await resolveSupplierDealer({
    tenantId,
    dealerId: productDetails.dealer_id,
  });

  if (!supplierDealer) {
    return next(new AppError("invalid supplier dealer selection", 400));
  }

  // add tenant id to the product
  productDetails.tenant_id = tenantId;
  productDetails.dealer_id = supplierDealer.id;

  await ProductCatalog.sync();

  // add to the catalog
  const product = await ProductCatalog.create(productDetails);

  const savedProduct = await ProductCatalog.findOne({
    where: { id: product.id, tenant_id: tenantId },
    include: [
      {
        model: Dealer,
        attributes: ["id", "name", "phone", "gst"],
        required: false,
      },
    ],
  });

  res.status(200).json({
    status: "success",
    result: savedProduct,
  });
});

exports.updateProductDetails = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const productId = req.params.id;

  if (!productId) return next(new AppError("product id is invalid!", 400));

  let productDetails;

  try {
    productDetails = validateAndCastPayload(normalizePayload(req.body));
  } catch (err) {
    return next(err);
  }

  const supplierDealer = await resolveSupplierDealer({
    tenantId: tenant.id,
    dealerId: productDetails.dealer_id,
  });

  if (!supplierDealer) {
    return next(new AppError("invalid supplier dealer selection", 400));
  }

  productDetails.dealer_id = supplierDealer.id;

  let product = null;

  await ProductCatalog.sequelize.transaction(async (transaction) => {
    const [updatedRows] = await ProductCatalog.update(productDetails, {
      where: { id: productId, tenant_id: tenant.id },
      transaction,
    });

    if (!updatedRows) throw new AppError("product not found", 404);

    // Keep current in-stock inventory cards aligned with catalog metadata edits.
    await Inventory.update(
      {
        name: productDetails.name,
        brand: productDetails.brand,
        hsn_code: productDetails.hsn_code,
        unit_name: productDetails.unit_name,
        unit_qty: productDetails.unit_qty,
        mrp: productDetails.mrp,
        rate: productDetails.rate,
      },
      {
        where: {
          tenant_id: tenant.id,
          product_catalog_id: productId,
          product_qty: { [Op.gt]: 0 },
        },
        transaction,
      },
    );

    product = await ProductCatalog.findOne({
      where: { id: productId, tenant_id: tenant.id },
      include: [
        {
          model: Dealer,
          attributes: ["id", "name", "phone", "gst"],
          required: false,
        },
      ],
      transaction,
    });
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
