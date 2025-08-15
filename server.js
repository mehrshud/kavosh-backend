// server.js - Fixed version with API Key Rotation
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- NEW: API Key Manager ---
// This manager handles loading multiple API keys from your .env file
// and rotating them if one fails (e.g., due to rate limits).
const apiKeys = {
  openai: [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3,
  ].filter(Boolean),
  gemini: [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
    Boolean
  ),
  twitter: [
    process.env.TWITTER_BEARER_TOKEN,
    process.env.TWITTER_BEARER_TOKEN_2,
  ].filter(Boolean),
};

const keyManager = {
  indices: { openai: 0, gemini: 0, twitter: 0 },
  getKey: function (service) {
    const keys = apiKeys[service];
    if (!keys || keys.length === 0) return null;
    const key = keys[this.indices[service]];
    return key;
  },
  rotateKey: function (service) {
    const keys = apiKeys[service];
    if (!keys || keys.length < 2) return; // No need to rotate if only one key
    this.indices[service] = (this.indices[service] + 1) % keys.length;
    console.log(
      `🔄 Rotated ${service} key. New index: ${this.indices[service]}`
    );
  },
};
// --- End of API Key Manager ---

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again after 15 minutes.",
  },
});
app.use(limiter);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://newkavosh.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.includes(".vercel.app")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const createStandardResponse = (
  success,
  data = null,
  message = null,
  platform = null
) => ({
  success,
  timestamp: new Date().toISOString(),
  data,
  message,
  platform,
});

app.get("/", (req, res) => {
  res.json({
    service: "Kavosh Backend API",
    version: "1.1.0",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// --- UPDATED: Twitter Search Helper with Key Rotation ---
async function makeTwitterSearch(query, count) {
  const maxRetries = (apiKeys.twitter || []).length || 1;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getKey("twitter");
    if (!currentKey) throw new Error("No valid Twitter API keys configured.");

    console.log(
      `🐦 Attempting Twitter search with key index: ${keyManager.indices.twitter}`
    );
    const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,verified`;

    const response = await fetch(twitterUrl, {
      headers: { Authorization: `Bearer ${currentKey}` },
    });

    // If rate-limited or key is invalid, rotate and retry
    if (response.status === 429 || response.status === 401) {
      console.warn(
        `Twitter API key failed (Status: ${response.status}). Rotating key.`
      );
      keyManager.rotateKey("twitter");
      if (attempt === maxRetries - 1) {
        throw new Error(
          `Twitter API Error: ${response.status} - All keys failed or are rate-limited.`
        );
      }
      continue; // Try next key
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.detail || `Twitter API Error: ${response.status}`
      );
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
        name: "Unknown User",
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
  }
  throw new Error("All Twitter API attempts failed.");
}

// Helper function to create mock results
function createMockResults(platform, query, count) {
  const results = Array.from({ length: Math.min(count, 8) }, (_, i) => ({
    id: `mock_${platform}_${Date.now()}_${i}`,
    text: `محتوای آزمایشی از ${platform} برای "${query}" - نتیجه ${i + 1}`,
    author: { username: `user_${i}`, name: `کاربر ${i}` },
    metrics: {
      like_count: Math.floor(Math.random() * 100),
      reply_count: Math.floor(Math.random() * 20),
      retweet_count: Math.floor(Math.random() * 30),
      impression_count: Math.floor(Math.random() * 1000),
    },
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    url: `#`,
    platform: platform,
  }));
  return {
    success: true,
    data: {
      results,
      total: results.length,
      platform: platform,
      note: `Mock data for ${platform}`,
    },
  };
}

app.post("/api/search/multi", async (req, res) => {
  const { query, platforms = ["twitter"], count = 20 } = req.body;
  if (!query) {
    return res
      .status(400)
      .json(createStandardResponse(false, null, "Query is required"));
  }

  const searchPromises = platforms.map(async (platform) => {
    try {
      switch (platform) {
        case "twitter":
          return await makeTwitterSearch(query, count);
        // Add cases for other real APIs here in the future
        case "instagram":
        case "facebook":
        case "eitaa":
        case "telegram":
        case "rubika":
        default:
          return createMockResults(platform, query, count);
      }
    } catch (error) {
      console.error(`💥 Failed to search ${platform}:`, error.message);
      return {
        success: false,
        error: error.message,
        platform: platform,
        data: { results: [] },
      };
    }
  });

  try {
    const results = await Promise.all(searchPromises);
    const platformResults = {};
    let totalResults = 0;
    results.forEach((result) => {
      platformResults[result.data.platform] = result;
      if (result.success) {
        totalResults += result.data.total;
      }
    });

    res.json(
      createStandardResponse(true, {
        platforms: platformResults,
        total: totalResults,
        query,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "multi"));
  }
});

// --- UPDATED: AI Endpoint with Key Rotation ---
app.post("/api/ai/enhance", async (req, res) => {
  const { text, query } = req.body;
  if (!text) {
    return res
      .status(400)
      .json(
        createStandardResponse(false, null, "Text is required for AI analysis.")
      );
  }

  const maxRetries = (apiKeys.openai || []).length || 1;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getKey("openai");
    if (!currentKey) {
      return res
        .status(500)
        .json(
          createStandardResponse(false, null, "No OpenAI API keys configured.")
        );
    }

    console.log(
      `🤖 Attempting OpenAI analysis with key index: ${keyManager.indices.openai}`
    );
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful social media analyst. Analyze the following content in Persian (Farsi).",
              },
              {
                role: "user",
                content: `Summarize the key points and overall sentiment from this collection of social media posts about "${query}":\n\n${text.substring(
                  0,
                  3000
                )}`,
              },
            ],
            max_tokens: 300,
            temperature: 0.5,
          }),
        }
      );

      if (response.status === 429 || response.status === 401) {
        console.warn(
          `OpenAI API key failed (Status: ${response.status}). Rotating key.`
        );
        keyManager.rotateKey("openai");
        if (attempt === maxRetries - 1) {
          return res
            .status(503)
            .json(
              createStandardResponse(
                false,
                null,
                "AI service is temporarily unavailable. All keys failed."
              )
            );
        }
        continue; // Retry with the next key
      }

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(
          errorBody.error.message || `OpenAI API Error: ${response.status}`
        );
      }

      const data = await response.json();
      const analysis = data.choices[0]?.message?.content.trim();
      return res.json(createStandardResponse(true, { analysis }));
    } catch (error) {
      console.error("AI enhancement error:", error.message);
      if (attempt === maxRetries - 1) {
        return res
          .status(500)
          .json(createStandardResponse(false, null, error.message));
      }
    }
  }
});

// 404 handler
app.use((req, res) => {
  res
    .status(404)
    .json(
      createStandardResponse(
        false,
        null,
        `Endpoint not found: ${req.originalUrl}`
      )
    );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Kavosh Backend Server is running on port ${PORT}`);
  console.log(`🔑 Twitter keys loaded: ${apiKeys.twitter.length}`);
  console.log(`🔑 OpenAI keys loaded: ${apiKeys.openai.length}`);
});
