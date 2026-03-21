const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");

router.route("/").get(inventoryController.getInventory); // get inventory (given 8 records per page)
router
  .route("/:id")
  .get(inventoryController.getInventoryById)
  .patch(inventoryController.updateInventoryById);

module.exports = router;
