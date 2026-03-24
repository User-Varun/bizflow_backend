const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");
const authController = require("../controllers/authController");

router.use(authController.protect);

router.route("/").get(inventoryController.getInventory); // get inventory (given 8 records per page)
router.route("/:id").get(inventoryController.getInventoryById);

module.exports = router;
