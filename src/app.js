const express = require("express");
const app = express();
const AppError = require("./utilities/appError");
const cookieParser = require("cookie-parser");

// Routers
const DashboardRouter = require("./routes/dashboardRotues");
const InventoryRouter = require("./routes/inventoryRoutes");
const ProductCatalogRouter = require("./routes/productCatalogRoutes");
const GenerateBillRouter = require("./routes/generateBillRoutes");
const ViewBillsRouter = require("./routes/viewBillsRotues");
const AuthRouter = require("./routes/authRoutes");

app.use(express.json()); // json body parser
app.use(cookieParser()); // express cookie parser

// Auth Routes
app.use("/api/v1/auth", AuthRouter);

// page routes
app.use("/api/v1/dashboard", DashboardRouter);
app.use("/api/v1/inventory", InventoryRouter);
app.use("/api/v1/productCatalog", ProductCatalogRouter);
app.use("/api/v1/generateBill", GenerateBillRouter);
app.use("/api/v1/viewBills", ViewBillsRouter);

// invalid routes
app.use((req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server.`, 404));
});

// Global Error Middleware
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || "error";
  const message = err.message || `Error: ${err}`;

  res.status(statusCode).send({
    status,
    message,
  });
});

module.exports = app;
