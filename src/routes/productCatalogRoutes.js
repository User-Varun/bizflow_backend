const express = require("express");

const router = express.Router();

const productCatalogController = require("../controllers/productCatalogController");
// - POST /api/v1/productCatalog
// - GET /api/v1/productCatalog
// - GET /api/v1/productCatalog/:id
// - PATCH /api/v1/productCatalog/:id

router
  .route("/")
  .get(productCatalogController.getProducts) // 8 results per page
  .post(productCatalogController.addProduct);

router
  .route("/:id")
  .get(productCatalogController.getProductById)
  .patch(productCatalogController.updateProductDetails);

module.exports = router;
