const express = require("express");

const router = express.Router();
const generateInvoiceController = require("../controllers/generateInvoiceController");
const authController = require("../controllers/authController");

// routes here

router.post(
  "/",
  authController.protect,
  generateInvoiceController.generateInvoice,
);

module.exports = router;
