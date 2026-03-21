const express = require("express");

const router = express.Router();
const generateBillController = require("../controllers/generateBillController");

// routes here

router.post("/generateBill", generateBillController.generateBill);

module.exports = router;
