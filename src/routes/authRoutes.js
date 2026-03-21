const express = require("express");
const AuthController = require("../controllers/authController");
const router = express.Router();

// routes here
router.post("/login", AuthController.login);
router.post("/register", AuthController.register);
router.post("/logout", AuthController.protect, AuthController.logout);

// google api implementation remaining

module.exports = router;
