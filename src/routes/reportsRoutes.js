const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reportsController");
const authController = require("../controllers/authController");

router.post("/download-bills", authController.protect, reportsController.downloadBills);

module.exports = router;
