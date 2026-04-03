const express = require("express");

const router = express.Router();
const dealerController = require("../controllers/dealerController");
const authController = require("../controllers/authController");

router.use(authController.protect);

router.get("/", dealerController.getDealers);
router.post("/", dealerController.upsertDealer);
router.get("/:id/invoices", dealerController.getDealerInvoices);
router.get("/:id/ledger/summary", dealerController.getDealerLedgerSummary);
router.get("/:id/ledger/statement", dealerController.getDealerLedgerStatement);
router.get("/:id", dealerController.getDealerById);
router.patch("/:id", dealerController.updateDealer);

module.exports = router;
