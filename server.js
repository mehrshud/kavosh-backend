// server.js (updated)
// NOTE: keep your existing route handlers below — this file includes the same handlers you already had,
// with small improvements around logging, CORS, and a basic root route for quick testing.

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------------
// Simple request logger
// ----------------------
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Origin: ${
      req.headers.origin || "N/A"
    }`
  );
  next();
});

// ----------------------
// CORS configuration
// ----------------------
const allowedOrigins = [
  "http://localhost:3000",
  "https://newkavosh.vercel.app", // your Vercel frontend
  process.env.FRONTEND_URL, // value from Railway variables (if set)
].filter(Boolean);

// dynamic origin check: allow non-browser traffic (curl/postman) when origin is missing
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // block other origins
      return callback(new Error("CORS: Origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ----------------------
// Root + health
// ----------------------
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Kavosh Backend API",
    environment: process.env.NODE_ENV || "development",
    now: new Date().toISOString(),
    healthEndpoint: "/health",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Kavosh Backend API",
  });
});

// ----------------------
// YOUR EXISTING ROUTES
// (paste all your /api/search/*, /api/ai/enhance, helpers, etc. here)
// ----------------------

// (Keep your existing route code exactly as it is.)
// For example (abbreviated):
// app.post("/api/search/instagram", async (req, res) => { ... });
// app.post("/api/search/twitter", async (req, res) => { ... });
// app.post("/api/search/eitaa", async (req, res) => { ... });
// app.post("/api/search/multi", async (req, res) => { ... });
// app.post("/api/ai/enhance", async (req, res) => { ... });

// ----------------------
// Error handler & 404
// ----------------------
app.use((error, req, res, next) => {
  console.error("Server Error:", error && error.stack ? error.stack : error);
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? error.message || "Internal server error"
        : "Internal server error",
  });
});

app.use("*", (req, res) => {
  console.warn(
    `404: ${req.method} ${req.originalUrl} - from ${
      req.headers.origin || "N/A"
    }`
  );
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kavosh Backend Server listening on port ${PORT}`);
  console.log(`🌍 NODE_ENV=${process.env.NODE_ENV || "development"}`);
  console.log(`⚡ FRONTEND_URL=${process.env.FRONTEND_URL || "Not set"}`);
});
