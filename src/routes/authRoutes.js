const express = require("express");
const AuthController = require("../controllers/authController");
const router = express.Router();

// routes here
router.post("/login", AuthController.login);
router.post("/register", AuthController.register);
router.post("/logout", AuthController.protect, AuthController.logout);
router.get("/me", AuthController.protect, AuthController.getMe);
router.patch(
  "/tenant-payment-details",
  AuthController.protect,
  AuthController.updateTenantPaymentDetails,
);

// google api implementation remaining

module.exports = router;
