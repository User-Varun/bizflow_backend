// have access here to user and tenant details at req.user and req.tenant

const AppError = require("../utilities/appError");
const ProductCatalog = require("../models/productCatalogModel");
const { catchAsync } = require("../utilities/catchAsync");

exports.getProducts = () => {};
exports.getProductById = () => {};
exports.addProduct = catchAsync(async (req, res, next) => {
  // get details from req.body
  const productDetails = {
    name: req.body.name,
    brand: req.body.brand,
    mrp: req.body.mrp,
    hsn_code: req.body.hsn_code,
    unit_name: req.body.unit_name,
    unit_qty: req.body.unit_qty,
  };

  if (
    !productDetails.name ||
    !productDetails.brand ||
    !productDetails.mrp ||
    !productDetails.hsn_code ||
    !productDetails.unit_name ||
    !productDetails.unit_qty
  )
    return next(new AppError("invalid product details!", 400));

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
exports.updateProductDetails = () => {};
