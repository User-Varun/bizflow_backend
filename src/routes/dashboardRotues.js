const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authController = require("../controllers/authController");

// routes here
router.use(authController.protect);
router.get("/summary", dashboardController.getSummary); // provides the summary that can be then displayed

module.exports = router;
