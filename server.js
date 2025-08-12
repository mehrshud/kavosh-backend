// server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Rate Limiting
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return (
      req.path === "/health" || req.path === "/api/test" || req.path === "/"
    );
  },
});
app.use(limiter);

// Request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const origin = req.headers.origin || req.headers.referer || "N/A";
  const userAgent = req.headers["user-agent"] || "N/A";

  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  console.log(`  Origin: ${origin}`);
  console.log(`  IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`  User-Agent: ${userAgent.substring(0, 100)}...`);

  if (req.method === "POST" && req.body) {
    console.log(`  Body:`, JSON.stringify(req.body, null, 2).substring(0, 500));
  }

  next();
});

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://localhost:3000",
  "https://localhost:3001",
  "https://newkavosh.vercel.app",
  "https://kavosh-social-search.vercel.app",
  "https://kavosh.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.includes(".vercel.app")) return callback(null, true);
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return callback(null, true);
    }
    console.warn(`❌ CORS: Origin not allowed: ${origin}`);
    return callback(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept"],
  exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Helper Functions
const validateApiKey = (service, key) => {
  if (!key || key.includes("your_") || key === "undefined" || key === "null") {
    console.warn(`⚠️ ${service} API key not configured or invalid`);
    throw new Error(`${service} API key not configured`);
  }
};

const createStandardResponse = (
  success,
  data = null,
  message = null,
  platform = null
) => {
  const response = {
    success,
    timestamp: new Date().toISOString(),
  };
  if (data) response.data = data;
  if (message) response.message = message;
  if (platform) response.platform = platform;
  return response;
};

// Root & Health endpoints
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Kavosh Backend API",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    port: PORT,
    endpoints: {
      health: "/health",
      test: "/api/test",
      twitter: "/api/search/twitter",
      instagram: "/api/search/instagram",
      eitaa: "/api/search/eitaa",
      multi: "/api/search/multi",
      ai: "/api/ai/enhance",
    },
    cors: {
      allowedOrigins: allowedOrigins,
      currentOrigin: req.headers.origin || "none",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Kavosh Backend API",
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Test Endpoint
app.get("/api/test", (req, res) => {
  console.log("🧪 Test endpoint called");

  const apiKeysStatus = {
    twitter:
      !!process.env.TWITTER_BEARER_TOKEN &&
      !process.env.TWITTER_BEARER_TOKEN.includes("your_") &&
      process.env.TWITTER_BEARER_TOKEN !== "undefined",
    instagram:
      !!process.env.INSTAGRAM_ACCESS_TOKEN &&
      !process.env.INSTAGRAM_ACCESS_TOKEN.includes("your_") &&
      process.env.INSTAGRAM_ACCESS_TOKEN !== "undefined",
    eitaa:
      !!process.env.EITAA_TOKEN &&
      !process.env.EITAA_TOKEN.includes("your_") &&
      process.env.EITAA_TOKEN !== "undefined",
    openai:
      !!process.env.OPENAI_API_KEY &&
      !process.env.OPENAI_API_KEY.includes("your_") &&
      process.env.OPENAI_API_KEY !== "undefined",
    gemini:
      !!process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes("your_") &&
      process.env.GEMINI_API_KEY !== "undefined",
  };

  res.json(createStandardResponse(true, { api_keys_status: apiKeysStatus }));
});

// Twitter Search Endpoint
app.post("/api/search/twitter", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    validateApiKey("Twitter", process.env.TWITTER_BEARER_TOKEN);
    if (!query) {
      return res.json(
        createStandardResponse(
          false,
          null,
          "Query parameter is required",
          "twitter"
        )
      );
    }

    const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${count}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,verified,profile_image_url`;
    const response = await fetch(twitterUrl, {
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
      },
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseErr) {
        throw new Error(
          `Twitter API error: ${response.status} - ${response.statusText}`
        );
      }
      const errorMsg =
        errorData.title ||
        errorData.detail ||
        errorData.message ||
        `Twitter API error: ${response.status}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const users =
      data.includes?.users?.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {}) || {};

    const results = (data.data || []).map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      author: users[tweet.author_id]
        ? {
            id: tweet.author_id,
            name: users[tweet.author_id].name,
            username: users[tweet.author_id].username,
            verified: users[tweet.author_id].verified,
            profile_image_url: users[tweet.author_id].profile_image_url,
          }
        : {},
      metrics: tweet.public_metrics,
      created_at: tweet.created_at,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      platform: "twitter",
    }));

    res.json(
      createStandardResponse(true, {
        results,
        total: results.length,
        query,
        platform: "twitter",
      })
    );
  } catch (error) {
    console.error("🐦💥 Twitter Search Error:", error.message, error.stack);
    res
      .status(500)
      .json(
        createStandardResponse(
          false,
          null,
          error.message || "Unknown Twitter error",
          "twitter"
        )
      );
  }
});

// Instagram Search Endpoint (placeholder/mock)
app.post("/api/search/instagram", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    validateApiKey("Instagram", process.env.INSTAGRAM_ACCESS_TOKEN);
    if (!query) throw new Error("Query is required");

    // Mock data as placeholder
    const mockResults = Array.from({ length: count }, (_, i) => ({
      id: `mock_insta_${Date.now()}_${i}`,
      content: `Mock Instagram post about ${query} #${i + 1}`,
      author: {
        username: `user_${i}`,
        verified: i % 3 === 0,
        followers: Math.floor(Math.random() * 10000),
      },
      metrics: {
        likes: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 100),
        views: Math.floor(Math.random() * 5000),
      },
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      url: `https://instagram.com/p/mock_${Date.now()}_${i}`,
      platform: "instagram",
    }));

    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "instagram",
        note: "Using mock data - Real Instagram API requires business account and app review",
      })
    );
  } catch (error) {
    console.error("📸💥 Instagram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "instagram"));
  }
});

// Eitaa Search Endpoint (assuming token is valid)
app.post("/api/search/eitaa", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    validateApiKey("Eitaa", process.env.EITAA_TOKEN);
    if (!query) throw new Error("Query is required");

    // Implement real Eitaa API call here if available
    // For now, mock
    const mockResults = Array.from({ length: count }, (_, i) => ({
      id: `mock_eitaa_${Date.now()}_${i}`,
      content: `Mock Eitaa message about ${query} #${i + 1}`,
      author: {
        username: `user_${i}`,
        verified: i % 4 === 0,
      },
      metrics: {
        views: Math.floor(Math.random() * 5000),
      },
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      url: `https://eitaa.com/channel/mock_${i}`,
      platform: "eitaa",
    }));

    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "eitaa",
      })
    );
  } catch (error) {
    console.error("💬💥 Eitaa Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "eitaa"));
  }
});

// Facebook Search Endpoint (mock)
app.post("/api/search/facebook", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    validateApiKey("Facebook", process.env.FACEBOOK_ACCESS_TOKEN);
    if (!query) throw new Error("Query is required");

    // Mock data
    const mockResults = Array.from({ length: count }, (_, i) => ({
      id: `mock_fb_${Date.now()}_${i}`,
      content: `Mock Facebook post about ${query} #${i + 1}`,
      author: {
        name: `User ${i + 1}`,
        verified: i % 5 === 0,
        followers: Math.floor(Math.random() * 5000),
      },
      metrics: {
        likes: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 100),
        shares: Math.floor(Math.random() * 50),
        views: Math.floor(Math.random() * 5000),
      },
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      url: `https://facebook.com/post/mock_${Date.now()}_${i}`,
      platform: "facebook",
    }));

    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "facebook",
        note: "Using mock data - Facebook API requires app review",
      })
    );
  } catch (error) {
    console.error("📘💥 Facebook Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "facebook"));
  }
});

// Multi-Platform Search Endpoint
app.post("/api/search/multi", async (req, res) => {
  const { query, platforms = ["twitter"], count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const platformResults = {};
    let totalResults = 0;

    for (const platform of platforms) {
      try {
        const platformEndpoint = `/api/search/${platform}`;
        const platformReq = { body: { query, count } };
        const platformRes = await new Promise((resolve) => {
          app._router.handle(
            {
              ...req,
              url: platformEndpoint,
              originalUrl: platformEndpoint,
              body: platformReq.body,
            },
            { json: resolve }
          );
        });
        platformResults[platform] = platformRes;
        if (platformRes.success) totalResults += platformRes.data.total || 0;
      } catch (platErr) {
        platformResults[platform] = { success: false, error: platErr.message };
      }
    }

    res.json(
      createStandardResponse(true, {
        platforms: platformResults,
        total: totalResults,
        query,
        platform: "multi",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "multi"));
  }
});

// AI Enhance Endpoint (example with OpenAI/Gemini)
app.post("/api/ai/enhance", async (req, res) => {
  const { text, service = "openai", analysisType = "summary" } = req.body;
  try {
    if (!text) throw new Error("Text is required");

    let analysis;
    if (service === "openai") {
      validateApiKey("OpenAI", process.env.OPENAI_API_KEY);
      const openaiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "user", content: `Summarize this text: ${text}` },
            ],
          }),
        }
      );
      if (!openaiResponse.ok) throw new Error("OpenAI API error");
      const openaiData = await openaiResponse.json();
      analysis = openaiData.choices[0].message.content;
    } else if (service === "gemini") {
      validateApiKey("Gemini", process.env.GEMINI_API_KEY);
      // Implement Gemini API call similarly
      analysis = "Mock Gemini analysis"; // Placeholder
    } else {
      throw new Error("Invalid AI service");
    }

    res.json(createStandardResponse(true, { analysis }));
  } catch (error) {
    console.error("🤖💥 AI Enhance Error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// Additional endpoints
app.get("/api/history", (req, res) => {
  res.json(
    createStandardResponse(true, {
      searches: [],
      message: "Search history feature requires database configuration",
    })
  );
});

app.get("/api/analytics", (req, res) => {
  res.json(
    createStandardResponse(true, {
      total_searches: 0,
      popular_queries: [],
      platform_usage: {
        twitter: 0,
        instagram: 0,
        eitaa: 0,
        facebook: 0,
      },
      message: "Analytics feature requires database configuration",
    })
  );
});

// Error handler
app.use((error, req, res, next) => {
  console.error("💥 Server Error:", error);
  console.error("Stack trace:", error.stack);

  res
    .status(500)
    .json(
      createStandardResponse(
        false,
        null,
        process.env.NODE_ENV === "development"
          ? error.message || "Internal server error"
          : "Internal server error"
      )
    );
});

app.use("*", (req, res) => {
  console.warn(
    `❓ 404: ${req.method} ${req.originalUrl} - from ${
      req.headers.origin || req.ip || "Unknown"
    }`
  );

  res
    .status(404)
    .json(
      createStandardResponse(
        false,
        null,
        `Endpoint not found: ${req.originalUrl}. Available endpoints: /, /health, /api/test, /api/search/*`
      )
    );
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Kavosh Backend Server STARTED successfully!`);
  console.log(`📍 Server running on: http://0.0.0.0:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`⚡ Railway URL: ${process.env.RAILWAY_STATIC_URL || "Not set"}`);
  console.log(
    `🔗 Public URL: ${
      process.env.RAILWAY_STATIC_URL
        ? `https://${process.env.RAILWAY_STATIC_URL}`
        : `http://localhost:${PORT}`
    }`
  );
  console.log(`🎯 Frontend URL: ${process.env.FRONTEND_URL || "Not set"}`);
  console.log(`\n📊 API Status Check:`);

  const apiStatus = {
    twitter:
      !!process.env.TWITTER_BEARER_TOKEN &&
      !process.env.TWITTER_BEARER_TOKEN.includes("your_"),
    instagram:
      !!process.env.INSTAGRAM_ACCESS_TOKEN &&
      !process.env.INSTAGRAM_ACCESS_TOKEN.includes("your_"),
    eitaa:
      !!process.env.EITAA_TOKEN && !process.env.EITAA_TOKEN.includes("your_"),
    openai:
      !!process.env.OPENAI_API_KEY &&
      !process.env.OPENAI_API_KEY.includes("your_"),
    gemini:
      !!process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes("your_"),
  };

  Object.entries(apiStatus).forEach(([service, status]) => {
    console.log(
      `   ${service}: ${status ? "✅ Configured" : "❌ Missing/Invalid"}`
    );
  });

  console.log(`\n📋 Available Endpoints:`);
  console.log(`   GET  / - Service info`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /api/test - Connection test`);
  console.log(`   POST /api/search/twitter - Twitter search`);
  console.log(`   POST /api/search/instagram - Instagram search`);
  console.log(`   POST /api/search/eitaa - Eitaa search`);
  console.log(`   POST /api/search/facebook - Facebook search`);
  console.log(`   POST /api/search/multi - Multi-platform search`);
  console.log(`   POST /api/ai/enhance - AI text analysis`);

  console.log(`\n🔧 Server Configuration:`);
  console.log(
    `   Rate Limit: ${
      process.env.RATE_LIMIT_MAX_REQUESTS || 200
    } requests per 15 minutes`
  );
  console.log(`   CORS Origins: ${allowedOrigins.length} configured`);
  console.log(`   Request Timeout: 30 seconds`);

  console.log(`\n✅ Server is ready to handle requests!`);
});

// Shutdown handling
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
// Add to server.js after existing platform endpoints

// Telegram Search Endpoint (mock)
app.post("/api/search/telegram", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");
    const mockResults = Array.from({ length: count }, (_, i) => ({
      id: `mock_telegram_${Date.now()}_${i}`,
      content: `Mock Telegram message about ${query} #${i + 1}`,
      author: { username: `user_${i}`, verified: i % 4 === 0 },
      metrics: { views: Math.floor(Math.random() * 5000) },
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      url: `https://t.me/channel/mock_${i}`,
      platform: "telegram",
    }));
    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "telegram",
      })
    );
  } catch (error) {
    console.error("📞💥 Telegram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "telegram"));
  }
});

// Rubika Search Endpoint (mock)
app.post("/api/search/rubika", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");
    const mockResults = Array.from({ length: count }, (_, i) => ({
      id: `mock_rubika_${Date.now()}_${i}`,
      content: `Mock Rubika post about ${query} #${i + 1}`,
      author: { username: `user_${i}`, verified: i % 5 === 0 },
      metrics: {
        likes: Math.floor(Math.random() * 1000),
        views: Math.floor(Math.random() * 5000),
      },
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      url: `https://rubika.ir/channel/mock_${i}`,
      platform: "rubika",
    }));
    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "rubika",
      })
    );
  } catch (error) {
    console.error("🔴💥 Rubika Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "rubika"));
  }
});
