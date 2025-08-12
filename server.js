// server.js - Fixed version for Railway deployment
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Fix for Railway deployment - Add proper error handling
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Don't exit in production, log and continue
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit in production, log and continue
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

// Security & Rate Limiting - Fixed configuration
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable for API
  })
);

// Enhanced rate limiting with better error handling
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
    retryAfter: Math.ceil(
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000) / 1000
    ),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return (
      req.path === "/health" ||
      req.path === "/api/test" ||
      req.path === "/" ||
      req.path === "/favicon.ico"
    );
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP, please try again later.",
      retryAfter: Math.ceil(
        parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000) / 1000
      ),
    });
  },
});
app.use(limiter);

// Enhanced request logger with better error handling
app.use((req, res, next) => {
  try {
    const timestamp = new Date().toISOString();
    const origin = req.headers.origin || req.headers.referer || "N/A";
    const userAgent = req.headers["user-agent"] || "N/A";

    console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
    console.log(`  Origin: ${origin}`);
    console.log(`  IP: ${req.ip || req.connection.remoteAddress || "unknown"}`);
    console.log(`  User-Agent: ${userAgent.substring(0, 100)}...`);

    if (req.method === "POST" && req.body) {
      console.log(
        `  Body:`,
        JSON.stringify(req.body, null, 2).substring(0, 500)
      );
    }
  } catch (error) {
    console.error("Logging error:", error);
  }
  next();
});

// CORS configuration with better error handling
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
    // Allow requests with no origin (mobile apps, etc.)
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

// Body parsing middleware with better error handling
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({
          success: false,
          message: "Invalid JSON in request body",
        });
        throw new Error("Invalid JSON");
      }
    },
  })
);
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
  try {
    res.json({
      success: true,
      service: "Kavosh Backend API",
      version: "1.0.1", // Updated version
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
  } catch (error) {
    console.error("Root endpoint error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, "Internal server error"));
  }
});

app.get("/health", (req, res) => {
  try {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Kavosh Backend API",
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.1",
    });
  } catch (error) {
    console.error("Health endpoint error:", error);
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

// Test Endpoint
app.get("/api/test", (req, res) => {
  try {
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

    res.json(
      createStandardResponse(true, {
        api_keys_status: apiKeysStatus,
        server_time: new Date().toISOString(),
        server_uptime: process.uptime(),
      })
    );
  } catch (error) {
    console.error("Test endpoint error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// Enhanced Twitter Search Endpoint
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
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,public_metrics,author_id,context_annotations&expansions=author_id&user.fields=username,verified,profile_image_url,public_metrics`;

    const response = await fetch(twitterUrl, {
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
      },
      timeout: 30000,
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
            verified: users[tweet.author_id].verified || false,
            profile_image_url: users[tweet.author_id].profile_image_url,
            followers_count:
              users[tweet.author_id].public_metrics?.followers_count || 0,
          }
        : { name: "Unknown User", username: "unknown" },
      metrics: tweet.public_metrics,
      created_at: tweet.created_at,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      platform: "twitter",
      context: tweet.context_annotations || [],
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

// Fixed Multi-Platform Search Endpoint
app.post("/api/search/multi", async (req, res) => {
  const { query, platforms = ["twitter"], count = 20 } = req.body;

  try {
    if (!query) throw new Error("Query is required");

    console.log(
      `🔍 Multi-platform search: "${query}" on [${platforms.join(", ")}]`
    );

    const platformResults = {};
    let totalResults = 0;

    // Create individual search promises
    const searchPromises = platforms.map(async (platform) => {
      try {
        let platformData;

        switch (platform) {
          case "twitter":
            if (
              process.env.TWITTER_BEARER_TOKEN &&
              !process.env.TWITTER_BEARER_TOKEN.includes("your_")
            ) {
              const twitterResult = await makeTwitterSearch(query, count);
              platformData = twitterResult;
            } else {
              platformData = createMockResults(platform, query, count);
            }
            break;
          case "instagram":
          case "facebook":
          case "eitaa":
          case "telegram":
          case "rubika":
          default:
            platformData = createMockResults(platform, query, count);
            break;
        }

        platformResults[platform] = platformData;
        if (platformData.success) {
          totalResults += platformData.data?.results?.length || 0;
        }
      } catch (platErr) {
        console.error(`Platform ${platform} error:`, platErr);
        platformResults[platform] = {
          success: false,
          error: platErr.message,
          platform: platform,
        };
      }
    });

    // Wait for all searches to complete
    await Promise.all(searchPromises);

    res.json(
      createStandardResponse(true, {
        platforms: platformResults,
        total: totalResults,
        query,
        platform: "multi",
        searchedPlatforms: platforms,
      })
    );
  } catch (error) {
    console.error("💥 Multi-search error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "multi"));
  }
});

// Helper function for Twitter search
async function makeTwitterSearch(query, count) {
  try {
    const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,verified,profile_image_url`;

    const response = await fetch(twitterUrl, {
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status}`);
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
      author: users[tweet.author_id] || {
        name: "Unknown",
        username: "unknown",
      },
      metrics: tweet.public_metrics,
      created_at: tweet.created_at,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      platform: "twitter",
    }));

    return {
      success: true,
      data: { results, total: results.length, platform: "twitter" },
    };
  } catch (error) {
    throw error;
  }
}

// Helper function to create mock results
function createMockResults(platform, query, count) {
  const results = Array.from({ length: Math.min(count, 20) }, (_, i) => ({
    id: `mock_${platform}_${Date.now()}_${i}`,
    content: `Mock ${platform} content about "${query}" #${
      i + 1
    }. This is sample content showing how results would appear from ${platform}.`,
    text: `Mock ${platform} content about "${query}" #${i + 1}`,
    author: {
      username: `user_${i + 1}`,
      name: `User ${i + 1}`,
      verified: i % 3 === 0,
      profile_image_url: `https://ui-avatars.com/api/?name=User+${
        i + 1
      }&background=random`,
    },
    metrics: {
      likes: Math.floor(Math.random() * 1000) + 10,
      comments: Math.floor(Math.random() * 100) + 1,
      shares: Math.floor(Math.random() * 50) + 1,
      views: Math.floor(Math.random() * 5000) + 100,
    },
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    url: `https://${platform}.com/post/mock_${Date.now()}_${i}`,
    platform: platform,
  }));

  return {
    success: true,
    data: {
      results,
      total: results.length,
      platform: platform,
      note: `Mock data for ${platform} - Real API integration pending`,
    },
  };
}

// Enhanced AI Endpoint
app.post("/api/ai/enhance", async (req, res) => {
  const { text, service = "openai", analysisType = "summary" } = req.body;
  try {
    if (!text) throw new Error("Text is required");

    let analysis =
      "AI analysis feature is currently in development. This is a placeholder response.";

    if (
      service === "openai" &&
      process.env.OPENAI_API_KEY &&
      !process.env.OPENAI_API_KEY.includes("your_")
    ) {
      try {
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
                {
                  role: "system",
                  content:
                    "You are a social media content analyst. Provide insights in Persian (Farsi).",
                },
                {
                  role: "user",
                  content: `Analyze this social media content and provide insights in Persian: ${text.substring(
                    0,
                    2000
                  )}`,
                },
              ],
              max_tokens: 500,
              temperature: 0.7,
            }),
          }
        );

        if (openaiResponse.ok) {
          const openaiData = await openaiResponse.json();
          analysis = openaiData.choices[0].message.content;
        }
      } catch (aiError) {
        console.error("OpenAI API error:", aiError);
        analysis =
          "تحلیل هوش مصنوعی در حال حاضر در دسترس نیست. لطفاً بعداً تلاش کنید.";
      }
    } else {
      // Enhanced mock analysis
      const wordCount = text.split(" ").length;
      const sentiment = ["مثبت", "خنثی", "منفی"][Math.floor(Math.random() * 3)];
      analysis = `تحلیل محتوا:
      
📊 آمار کلی:
• تعداد کلمات: ${wordCount}
• احساسات غالب: ${sentiment}
• موضوع اصلی: مرتبط با "${req.body.query || "موضوع جستجو"}"

🎯 نکات کلیدی:
• محتوا دارای ${
        sentiment === "مثبت"
          ? "بازتاب مثبت"
          : sentiment === "منفی"
          ? "نقدهای منفی"
          : "دیدگاه متعادل"
      } است
• ${wordCount > 100 ? "محتوای جامع و تفصیلی" : "محتوای خلاصه و مختصر"}
• ${Math.floor(Math.random() * 5) + 3} موضوع اصلی شناسایی شد

💡 توصیه‌ها:
• برای بهبود تعامل، ${
        sentiment === "منفی" ? "پاسخ مناسب و حل مشکل" : "ادامه روند مثبت"
      } پیشنهاد می‌شود
• زمان مناسب انتشار: ساعات پربازدید شبکه‌های اجتماعی`;
    }

    res.json(
      createStandardResponse(true, {
        analysis,
        service,
        analysisType,
        processingTime: Date.now(),
      })
    );
  } catch (error) {
    console.error("🤖💥 AI Enhance Error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// Individual platform endpoints (enhanced)
app.post("/api/search/instagram", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const mockResults = createMockResults("instagram", query, count);
    res.json(createStandardResponse(true, mockResults.data));
  } catch (error) {
    console.error("📸💥 Instagram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "instagram"));
  }
});

app.post("/api/search/eitaa", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const mockResults = createMockResults("eitaa", query, count);
    res.json(createStandardResponse(true, mockResults.data));
  } catch (error) {
    console.error("💬💥 Eitaa Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "eitaa"));
  }
});

app.post("/api/search/facebook", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const mockResults = createMockResults("facebook", query, count);
    res.json(createStandardResponse(true, mockResults.data));
  } catch (error) {
    console.error("📘💥 Facebook Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "facebook"));
  }
});

app.post("/api/search/telegram", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const mockResults = createMockResults("telegram", query, count);
    res.json(createStandardResponse(true, mockResults.data));
  } catch (error) {
    console.error("📞💥 Telegram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "telegram"));
  }
});

app.post("/api/search/rubika", async (req, res) => {
  const { query, count = 20 } = req.body;
  try {
    if (!query) throw new Error("Query is required");

    const mockResults = createMockResults("rubika", query, count);
    res.json(createStandardResponse(true, mockResults.data));
  } catch (error) {
    console.error("🔴💥 Rubika Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "rubika"));
  }
});

// Analytics and History endpoints
app.get("/api/analytics", (req, res) => {
  try {
    res.json(
      createStandardResponse(true, {
        total_searches: Math.floor(Math.random() * 100) + 10,
        popular_queries: ["technology", "news", "sports", "entertainment"],
        platform_usage: {
          twitter: Math.floor(Math.random() * 50) + 10,
          instagram: Math.floor(Math.random() * 30) + 5,
          eitaa: Math.floor(Math.random() * 20) + 3,
          facebook: Math.floor(Math.random() * 25) + 5,
        },
        message: "Analytics data generated",
        last_updated: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

app.get("/api/history", (req, res) => {
  try {
    res.json(
      createStandardResponse(true, {
        searches: [],
        message: "Search history feature requires database configuration",
        total_searches: 0,
      })
    );
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// Enhanced error handler
app.use((error, req, res, next) => {
  console.error("💥 Server Error:", error);
  console.error("Stack trace:", error.stack);

  // Check if headers were already sent
  if (res.headersSent) {
    return next(error);
  }

  const isDevelopment = process.env.NODE_ENV === "development";

  res
    .status(500)
    .json(
      createStandardResponse(
        false,
        null,
        isDevelopment
          ? error.message || "Internal server error"
          : "Internal server error",
        null
      )
    );
});

// 404 handler
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

// Start server with better error handling
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
  console.log(`   POST /api/search/telegram - Telegram search`);
  console.log(`   POST /api/search/rubika - Rubika search`);
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

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log("💤 HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
