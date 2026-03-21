const express = require("express");

const router = express.Router();
const viewBillsController = require("../controllers/viewBillsController");

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

router.get("/", viewBillsController.getBills); // pagination 8 records (will adjust as needed)
router.get("/:id", viewBillsController.getBillById);

module.exports = router;
