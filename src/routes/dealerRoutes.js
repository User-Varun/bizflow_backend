const express = require("express");

const router = express.Router();
const dealerController = require("../controllers/dealerController");
const authController = require("../controllers/authController");

router.use(authController.protect);

router.get("/", dealerController.getDealers);
router.post("/", dealerController.upsertDealer);

module.exports = router;
