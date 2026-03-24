const { catchAsync } = require("../utilities/catchAsync");
const Invoice = require("../models/invoiceModel");
const { Op } = require("sequelize");

exports.getSummary = catchAsync(async (req, res) => {
  //     Suggested summary metrics:

  // - total invoices in current month
  // - stock_out total in current month
  // - stock_in total in current month
  // - pending receivable total
  // - pending payable total
  // - low stock item count

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const invoiceTotal = await Invoice.findAll({
    where: {
      createdAt: {
        [Op.gte]: startOfMonth, // start date
        [Op.lte]: endOfMonth, // end date
      },
    },
  });

  res.status(200).json({
    status: "success",
    result: invoiceTotal,
  });
});
