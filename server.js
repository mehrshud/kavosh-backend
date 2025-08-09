const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------------
// Security & Rate Limiting
// ----------------------
app.use(helmet());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ----------------------
// Request logger
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
  "https://newkavosh.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
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
// Helper Functions
// ----------------------
const validateApiKey = (service, key) => {
  if (!key || key.includes("your_") || key === "undefined") {
    throw new Error(`${service} API key not configured`);
  }
};

const createStandardResponse = (
  success,
  data = null,
  message = null,
  platform = null
) => {
  const response = { success };
  if (data) response.data = data;
  if (message) response.message = message;
  if (platform) response.platform = platform;
  return response;
};

// ----------------------
// Root & Health endpoints
// ----------------------
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Kavosh Backend API",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      twitter: "/api/search/twitter",
      instagram: "/api/search/instagram",
      eitaa: "/api/search/eitaa",
      multi: "/api/search/multi",
      ai: "/api/ai/enhance",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Kavosh Backend API",
    uptime: process.uptime(),
  });
});

// ----------------------
// Twitter Search API
// ----------------------
app.post("/api/search/twitter", async (req, res) => {
  try {
    const { query, count = 10, lang = "fa" } = req.body;

    if (!query) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query parameter is required",
            "twitter"
          )
        );
    }

    validateApiKey("Twitter", process.env.TWITTER_BEARER_TOKEN);

    const searchUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,author_id,public_metrics,lang,context_annotations&user.fields=name,username,verified,public_metrics&expansions=author_id`;

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Twitter API Error:", response.status, errorData);
      return res
        .status(response.status)
        .json(
          createStandardResponse(
            false,
            null,
            `Twitter API error: ${response.status}`,
            "twitter"
          )
        );
    }

    const data = await response.json();

    // Transform Twitter API response to standard format
    const tweets = data.data || [];
    const users = data.includes?.users || [];
    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});

    const results = tweets.map((tweet) => {
      const author = userMap[tweet.author_id] || {};
      return {
        id: tweet.id,
        text: tweet.text,
        author: {
          id: tweet.author_id,
          name: author.name || "Unknown",
          username: author.username || "unknown",
          verified: author.verified || false,
          followers: author.public_metrics?.followers_count || 0,
        },
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
          quotes: tweet.public_metrics?.quote_count || 0,
        },
        created_at: tweet.created_at,
        lang: tweet.lang,
        url: `https://twitter.com/${author.username}/status/${tweet.id}`,
        platform: "twitter",
      };
    });

    res.json(
      createStandardResponse(true, {
        results,
        total: results.length,
        query,
        platform: "twitter",
      })
    );
  } catch (error) {
    console.error("Twitter Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "twitter"));
  }
});

// ----------------------
// Instagram Search API (Placeholder - requires business account)
// ----------------------
app.post("/api/search/instagram", async (req, res) => {
  try {
    const { query, count = 10 } = req.body;

    if (!query) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query parameter is required",
            "instagram"
          )
        );
    }

    // Instagram API requires business account and specific permissions
    // For now, return a message explaining the limitation
    res.json(
      createStandardResponse(true, {
        results: [],
        total: 0,
        query,
        platform: "instagram",
        message:
          "Instagram search requires Instagram Business API access. Please configure with proper business account credentials.",
      })
    );
  } catch (error) {
    console.error("Instagram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "instagram"));
  }
});

// ----------------------
// Eitaa Search API
// ----------------------
app.post("/api/search/eitaa", async (req, res) => {
  try {
    const { query, count = 10 } = req.body;

    if (!query) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query parameter is required",
            "eitaa"
          )
        );
    }

    validateApiKey("Eitaa", process.env.EITAA_TOKEN);

    // Eitaa API endpoint (adjust based on actual Eitaa API documentation)
    const searchUrl = `https://eitaabot.ir/api/search`;

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.EITAA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: Math.min(count, 50),
      }),
    });

    if (!response.ok) {
      console.error("Eitaa API Error:", response.status);
      return res
        .status(response.status)
        .json(
          createStandardResponse(
            false,
            null,
            `Eitaa API error: ${response.status}`,
            "eitaa"
          )
        );
    }

    const data = await response.json();

    // Transform Eitaa response to standard format
    const results = (data.results || []).map((item) => ({
      id: item.id || Date.now(),
      text: item.text || item.content || "",
      author: {
        id: item.author_id || item.channel_id,
        name: item.author_name || item.channel_name || "Unknown",
        username: item.author_username || item.channel_username || "unknown",
        verified: false,
        followers: 0,
      },
      metrics: {
        likes: item.likes || 0,
        shares: item.shares || 0,
        views: item.views || 0,
        comments: item.comments || 0,
      },
      created_at: item.created_at || item.date,
      url: item.url || "#",
      platform: "eitaa",
    }));

    res.json(
      createStandardResponse(true, {
        results,
        total: results.length,
        query,
        platform: "eitaa",
      })
    );
  } catch (error) {
    console.error("Eitaa Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "eitaa"));
  }
});

// ----------------------
// Multi-Platform Search
// ----------------------
app.post("/api/search/multi", async (req, res) => {
  try {
    const { query, platforms = ["twitter", "eitaa"], count = 10 } = req.body;

    if (!query) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query parameter is required",
            "multi"
          )
        );
    }

    const searchPromises = [];
    const results = {
      query,
      platforms: {},
      total: 0,
      timestamp: new Date().toISOString(),
    };

    // Search Twitter
    if (platforms.includes("twitter")) {
      searchPromises.push(
        fetch(`${req.protocol}://${req.get("host")}/api/search/twitter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            count: Math.floor(count / platforms.length),
          }),
        })
          .then((res) => res.json())
          .then((data) => ({
            platform: "twitter",
            data,
          }))
          .catch((error) => ({
            platform: "twitter",
            error: error.message,
          }))
      );
    }

    // Search Eitaa
    if (platforms.includes("eitaa")) {
      searchPromises.push(
        fetch(`${req.protocol}://${req.get("host")}/api/search/eitaa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            count: Math.floor(count / platforms.length),
          }),
        })
          .then((res) => res.json())
          .then((data) => ({
            platform: "eitaa",
            data,
          }))
          .catch((error) => ({
            platform: "eitaa",
            error: error.message,
          }))
      );
    }

    // Search Instagram (placeholder)
    if (platforms.includes("instagram")) {
      searchPromises.push(
        fetch(`${req.protocol}://${req.get("host")}/api/search/instagram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            count: Math.floor(count / platforms.length),
          }),
        })
          .then((res) => res.json())
          .then((data) => ({
            platform: "instagram",
            data,
          }))
          .catch((error) => ({
            platform: "instagram",
            error: error.message,
          }))
      );
    }

    const platformResults = await Promise.all(searchPromises);

    // Combine results
    platformResults.forEach((result) => {
      if (result.error) {
        results.platforms[result.platform] = {
          success: false,
          error: result.error,
          results: [],
        };
      } else if (result.data && result.data.success) {
        results.platforms[result.platform] = {
          success: true,
          results: result.data.data.results || [],
          total: result.data.data.total || 0,
        };
        results.total += result.data.data.total || 0;
      } else {
        results.platforms[result.platform] = {
          success: false,
          error: "Unknown error",
          results: [],
        };
      }
    });

    res.json(createStandardResponse(true, results));
  } catch (error) {
    console.error("Multi-Platform Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "multi"));
  }
});

// ----------------------
// AI Enhancement API
// ----------------------
app.post("/api/ai/enhance", async (req, res) => {
  try {
    const { text, service = "openai", analysisType = "sentiment" } = req.body;

    if (!text) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Text parameter is required for AI analysis"
          )
        );
    }

    let analysis = {};

    if (service === "openai" && process.env.OPENAI_API_KEY) {
      try {
        validateApiKey("OpenAI", process.env.OPENAI_API_KEY);

        const prompt =
          analysisType === "sentiment"
            ? `Analyze the sentiment of this text and provide a JSON response with sentiment (positive/negative/neutral), confidence (0-1), and key_emotions (array). Text: "${text}"`
            : `Summarize this text in Persian and provide key topics. Text: "${text}"`;

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-3.5-turbo",
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
              max_tokens: 150,
              temperature: 0.3,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content || "";

          try {
            analysis.openai = JSON.parse(content);
          } catch {
            analysis.openai = {
              sentiment: "neutral",
              confidence: 0.5,
              summary: content,
            };
          }
        }
      } catch (error) {
        console.error("OpenAI Error:", error);
        analysis.openai_error = error.message;
      }
    }

    if (service === "gemini" && process.env.GEMINI_API_KEY) {
      try {
        validateApiKey("Gemini", process.env.GEMINI_API_KEY);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Analyze the sentiment of this text (positive/negative/neutral) and provide confidence score: "${text}"`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.candidates[0]?.content?.parts[0]?.text || "";
          analysis.gemini = {
            analysis: content,
            sentiment: content.toLowerCase().includes("positive")
              ? "positive"
              : content.toLowerCase().includes("negative")
              ? "negative"
              : "neutral",
          };
        }
      } catch (error) {
        console.error("Gemini Error:", error);
        analysis.gemini_error = error.message;
      }
    }

    // Provide basic analysis if no AI service available
    if (Object.keys(analysis).length === 0) {
      analysis.basic = {
        sentiment: "neutral",
        confidence: 0.5,
        word_count: text.split(" ").length,
        character_count: text.length,
        message: "Basic analysis - configure AI APIs for enhanced results",
      };
    }

    res.json(
      createStandardResponse(true, {
        original_text: text,
        analysis,
        service_used: service,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("AI Enhancement Error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// ----------------------
// Facebook Search (Placeholder)
// ----------------------
app.post("/api/search/facebook", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query parameter is required",
            "facebook"
          )
        );
    }

    // Facebook API requires app review for search capabilities
    res.json(
      createStandardResponse(true, {
        results: [],
        total: 0,
        query,
        platform: "facebook",
        message:
          "Facebook search requires app review and specific permissions. Please configure with approved Facebook App.",
      })
    );
  } catch (error) {
    console.error("Facebook Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "facebook"));
  }
});

// ----------------------
// Search History (Optional)
// ----------------------
app.get("/api/history", (req, res) => {
  // This would typically connect to a database
  res.json(
    createStandardResponse(true, {
      searches: [],
      message: "Search history feature requires database configuration",
    })
  );
});

// ----------------------
// Analytics Endpoint
// ----------------------
app.get("/api/analytics", (req, res) => {
  res.json(
    createStandardResponse(true, {
      total_searches: 0,
      popular_queries: [],
      platform_usage: {
        twitter: 0,
        instagram: 0,
        eitaa: 0,
      },
      message: "Analytics feature requires database configuration",
    })
  );
});

// ----------------------
// Test endpoint for debugging
// ----------------------
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "API is working!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    cors_origin: req.headers.origin,
    api_keys_configured: {
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
    },
  });
});

// ----------------------
// Error handler & 404
// ----------------------
app.use((error, req, res, next) => {
  console.error("Server Error:", error && error.stack ? error.stack : error);
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
    `404: ${req.method} ${req.originalUrl} - from ${
      req.headers.origin || "N/A"
    }`
  );
  res
    .status(404)
    .json(createStandardResponse(false, null, "Endpoint not found"));
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kavosh Backend Server listening on port ${PORT}`);
  console.log(`🌍 NODE_ENV=${process.env.NODE_ENV || "development"}`);
  console.log(`⚡ FRONTEND_URL=${process.env.FRONTEND_URL || "Not set"}`);
  console.log(`🔑 API Keys Status:`);
  console.log(
    `   Twitter: ${
      !!process.env.TWITTER_BEARER_TOKEN &&
      !process.env.TWITTER_BEARER_TOKEN.includes("your_")
        ? "✅"
        : "❌"
    }`
  );
  console.log(
    `   Eitaa: ${
      !!process.env.EITAA_TOKEN && !process.env.EITAA_TOKEN.includes("your_")
        ? "✅"
        : "❌"
    }`
  );
  console.log(
    `   OpenAI: ${
      !!process.env.OPENAI_API_KEY &&
      !process.env.OPENAI_API_KEY.includes("your_")
        ? "✅"
        : "❌"
    }`
  );
  console.log(
    `   Gemini: ${
      !!process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes("your_")
        ? "✅"
        : "❌"
    }`
  );
});
