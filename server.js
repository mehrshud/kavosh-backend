// server.js - Railway compatible version with proper signal handling
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080; // Railway uses 8080 by default

// === RAILWAY-SPECIFIC FIXES ===
// 1. Handle process signals properly for Railway
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("👋 SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

// 2. Enhanced CORS for Railway
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://newkavosh.vercel.app",
    "http://localhost:3000",
    "https://localhost:3000",
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, Origin, X-Requested-With"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

// Standard CORS as backup
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://newkavosh.vercel.app",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Rate limiting (more lenient for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests from this IP" },
});
app.use("/api", limiter);

// === SIMPLIFIED API KEY MANAGEMENT ===
const apiKeys = {
  openai: [
    process.env.OPENAI_API_KEY_1,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3,
  ].filter(Boolean),
  twitter: [
    process.env.TWITTER_BEARER_TOKEN_1,
    process.env.TWITTER_BEARER_TOKEN_2,
    process.env.TWITTER_BEARER_TOKEN_3,
  ].filter(Boolean),
  gemini: [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2].filter(
    Boolean
  ),
};

console.log(
  `🔑 Loaded ${apiKeys.twitter.length} Twitter keys, ${apiKeys.openai.length} OpenAI keys, ${apiKeys.gemini.length} Gemini keys`
);

// Simple key rotation
let keyIndices = { openai: 0, twitter: 0, gemini: 0 };
const getApiKey = (service) => {
  const keys = apiKeys[service] || [];
  if (keys.length === 0) return null;
  return keys[keyIndices[service] % keys.length];
};

const rotateKey = (service) => {
  if (apiKeys[service] && apiKeys[service].length > 1) {
    keyIndices[service] = (keyIndices[service] + 1) % apiKeys[service].length;
    console.log(`🔄 Rotated ${service} key to index ${keyIndices[service]}`);
  }
};

// === HELPER FUNCTIONS ===
const createResponse = (success, data = null, message = null) => ({
  success,
  data,
  message,
  timestamp: new Date().toISOString(),
});

// Mock data generator for platforms without API access
function generateMockResults(platform, query, count) {
  const results = Array.from({ length: Math.min(count, 8) }, (_, i) => ({
    id: `${platform}_${Date.now()}_${i}`,
    text: `نمونه محتوا برای "${query}" در ${platform} - پست ${
      i + 1
    }. این یک نمونه داده برای نمایش عملکرد سیستم است.`,
    content: `نمونه محتوا برای "${query}" در ${platform} - پست ${
      i + 1
    }. این یک نمونه داده برای نمایش عملکرد سیستم است.`,
    author: {
      username: `user_${i}`,
      name: `کاربر ${i + 1}`,
    },
    metrics: {
      like_count: Math.floor(Math.random() * 1000) + 10,
      reply_count: Math.floor(Math.random() * 100) + 1,
      retweet_count: Math.floor(Math.random() * 200) + 5,
      impression_count: Math.floor(Math.random() * 5000) + 100,
      likes: Math.floor(Math.random() * 1000) + 10,
      comments: Math.floor(Math.random() * 100) + 1,
      shares: Math.floor(Math.random() * 200) + 5,
      views: Math.floor(Math.random() * 5000) + 100,
    },
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    date: new Date(Date.now() - i * 3600000).toISOString(),
    url: `#mock-${platform}-${i}`,
    platform: platform,
    sentiment: ["positive", "neutral", "negative"][
      Math.floor(Math.random() * 3)
    ],
    media_url:
      Math.random() > 0.8 ? `https://picsum.photos/400/300?random=${i}` : null,
    media_type: Math.random() > 0.8 ? "image" : "text",
  }));

  return {
    success: true,
    data: {
      results,
      total: results.length,
      platform,
      note: `نمونه داده برای ${platform} - در نسخه نهایی با API واقعی جایگزین می‌شود`,
    },
  };
}

// Twitter search function with proper error handling
async function searchTwitter(query, count) {
  const maxAttempts = Math.max(apiKeys.twitter.length, 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = getApiKey("twitter");
    if (!apiKey) {
      console.log("⚠️ No Twitter API key available, using mock data");
      return generateMockResults("twitter", query, count);
    }

    try {
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
        query
      )}&max_results=${Math.min(
        count,
        100
      )}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
      });

      if (response.status === 429 || response.status === 401) {
        console.log(`Twitter API key failed (${response.status}), rotating...`);
        rotateKey("twitter");
        continue;
      }

      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.status}`);
      }

      const data = await response.json();
      const users =
        data.includes?.users?.reduce(
          (acc, user) => ({ ...acc, [user.id]: user }),
          {}
        ) || {};

      const results = (data.data || []).map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        content: tweet.text,
        author: users[tweet.author_id]?.username || "Unknown",
        metrics: {
          ...tweet.public_metrics,
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          views: tweet.public_metrics?.impression_count || 0,
        },
        created_at: tweet.created_at,
        date: tweet.created_at,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
        platform: "twitter",
        sentiment: ["positive", "neutral", "negative"][
          Math.floor(Math.random() * 3)
        ],
        media_url: null,
        media_type: "text",
      }));

      return {
        success: true,
        data: { results, total: results.length, platform: "twitter" },
      };
    } catch (error) {
      console.error(`Twitter attempt ${attempt + 1} failed:`, error.message);
      if (attempt === maxAttempts - 1) {
        return generateMockResults("twitter", query, count);
      }
    }
  }
}

// === API ENDPOINTS ===

// Health check - simple and reliable
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    port: PORT,
    services: {
      twitter: apiKeys.twitter.length > 0 ? "configured" : "not configured",
      openai: apiKeys.openai.length > 0 ? "configured" : "not configured",
      cors: "enabled",
    },
  });
});

// Multi-platform search
app.post("/api/search/multi", async (req, res) => {
  try {
    const { query, platforms = [], count = 20 } = req.body;

    if (!query?.trim()) {
      return res
        .status(400)
        .json(
          createResponse(false, null, "Query is required and cannot be empty")
        );
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res
        .status(400)
        .json(
          createResponse(false, null, "At least one platform must be specified")
        );
    }

    console.log(`🔍 Searching "${query}" across: ${platforms.join(", ")}`);

    // Process each platform
    const searchResults = await Promise.allSettled(
      platforms.map(async (platform) => {
        try {
          switch (platform.toLowerCase()) {
            case "twitter":
              return await searchTwitter(query, count);
            case "telegram":
            case "instagram":
            case "facebook":
            case "eitaa":
            case "rubika":
              return generateMockResults(platform, query, count);
            default:
              throw new Error(`Unsupported platform: ${platform}`);
          }
        } catch (error) {
          return {
            success: false,
            error: error.message,
            data: { platform },
          };
        }
      })
    );

    // Compile results
    const platformResults = {};
    let totalResults = 0;

    searchResults.forEach((result, index) => {
      const platformName = platforms[index];
      if (result.status === "fulfilled" && result.value) {
        platformResults[platformName] = result.value;
        if (result.value.success) {
          totalResults += result.value.data?.total || 0;
        }
      } else {
        platformResults[platformName] = {
          success: false,
          error: result.reason?.message || "Search failed",
          data: { platform: platformName },
        };
      }
    });

    console.log(`✅ Search completed. Total results: ${totalResults}`);
    res.json(
      createResponse(true, {
        platforms: platformResults,
        total: totalResults,
        query: query.trim(),
        searchedPlatforms: platforms,
      })
    );
  } catch (error) {
    console.error("🔴 Search error:", error);
    res
      .status(500)
      .json(createResponse(false, null, `Server error: ${error.message}`));
  }
});

// AI Enhancement endpoint
app.post("/api/ai/enhance", async (req, res) => {
  try {
    const { text, query, service = "openai" } = req.body;

    if (!text?.trim()) {
      return res
        .status(400)
        .json(createResponse(false, null, "Text is required for AI analysis"));
    }

    const apiKey = getApiKey("openai");
    if (!apiKey) {
      return res.json(
        createResponse(true, {
          analysis: `تحلیل خودکار برای "${query}": بر اساس نتایج جستجو، محتوای مرتبطی یافت شده است. متاسفانه سرویس تحلیل هوش مصنوعی در حال حاضر در دسترس نیست.`,
        })
      );
    }

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful social media analyst. Respond in Persian (Farsi).",
              },
              {
                role: "user",
                content: `لطفاً محتوای زیر را که مربوط به جستجوی "${query}" است تحلیل کن و خلاصه کوتاهی از نکات اصلی و احساسات کلی ارائه ده:\n\n${text.substring(
                  0,
                  2000
                )}`,
              },
            ],
            max_tokens: 250,
            temperature: 0.5,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content?.trim();
        return res.json(createResponse(true, { analysis }));
      } else {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
    } catch (aiError) {
      console.warn("AI analysis failed:", aiError.message);
      return res.json(
        createResponse(true, {
          analysis: `تحلیل خودکار: بر اساس نتایج جستجو برای "${query}"، محتوای متنوعی یافت شده است. برای تحلیل دقیق‌تر، لطفاً مجدداً تلاش کنید.`,
        })
      );
    }
  } catch (error) {
    console.error("🔴 AI enhancement error:", error);
    res
      .status(500)
      .json(createResponse(false, null, `AI service error: ${error.message}`));
  }
});

// 404 handler
app.use("*", (req, res) => {
  res
    .status(404)
    .json(
      createResponse(
        false,
        null,
        `Endpoint not found: ${req.method} ${req.originalUrl}`
      )
    );
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("🔴 Global error:", error);
  res.status(500).json(createResponse(false, null, "Internal server error"));
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kavosh Backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔧 CORS enabled for: ${corsOptions.origin.join(", ")}`);
});

// Graceful shutdown
server.on("error", (error) => {
  console.error("🔴 Server error:", error);
});

console.log("✅ Server setup complete");
