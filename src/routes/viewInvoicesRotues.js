const express = require("express");

const router = express.Router();
const viewInvoicesController = require("../controllers/viewInvoicesController");
const authController = require("../controllers/authController");
/*
Recommended endpoints:

- GET /api/v1/viewBills
- GET /api/v1/viewBills/:id

Recommended filters:

- invoice_type (stock_in or stock_out)
- bill_state (pending, partial, paid)
- date range
- invoice_number search
*/

router.use(authController.protect);

router.get("/", viewInvoicesController.getInvoices); // pagination 8 records (will adjust as needed)
router.get("/:id", viewInvoicesController.getInvoiceById);

module.exports = router;
