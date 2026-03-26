const express = require("express");
const app = express();
const AppError = require("./utilities/appError");
const cookieParser = require("cookie-parser");
const cors = require("cors");

// Routers
const DashboardRouter = require("./routes/dashboardRotues");
const InventoryRouter = require("./routes/inventoryRoutes");
const ProductCatalogRouter = require("./routes/productCatalogRoutes");
const GenerateInvoicesRouter = require("./routes/generateInvoiceRoutes");
const ViewInvoicesRouter = require("./routes/viewInvoicesRotues");
const AuthRouter = require("./routes/authRoutes");

app.use(express.json()); // json body parser
app.use(cookieParser()); // express cookie parser

const allowedOrigins = [
  "http://localhost:5173",
  "https://bizflow-frontend-ww56.onrender.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow tools like Postman / server-to-server (no browser origin)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Auth Routes
app.use("/api/v1/auth", AuthRouter);

// page routes
app.use("/api/v1/dashboard", DashboardRouter);
app.use("/api/v1/inventory", InventoryRouter);
app.use("/api/v1/productCatalog", ProductCatalogRouter);
app.use("/api/v1/generateInvoice", GenerateInvoicesRouter);
app.use("/api/v1/viewInvoices", ViewInvoicesRouter);

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
    stackTrace: err.stack,
  });
});

module.exports = app;
