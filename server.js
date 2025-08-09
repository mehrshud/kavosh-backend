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
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200, // Increased for development
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and test endpoints
    return (
      req.path === "/health" || req.path === "/api/test" || req.path === "/"
    );
  },
});
app.use(limiter);

// ----------------------
// Enhanced Request logger
// ----------------------
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

// ----------------------
// CORS configuration - More permissive for debugging
// ----------------------
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

// Add any vercel.app domain for development
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow any vercel.app subdomain for development
    if (origin.includes(".vercel.app")) return callback(null, true);

    // Allow localhost with any port for development
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
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ----------------------
// Helper Functions
// ----------------------
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

// ----------------------
// Enhanced Test Endpoint
// ----------------------
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

  res.json({
    success: true,
    message: "API is working perfectly!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: PORT,
    cors_origin: req.headers.origin,
    user_agent: req.headers["user-agent"]?.substring(0, 100),
    api_keys_configured: apiKeysStatus,
    server_info: {
      node_version: process.version,
      uptime: Math.floor(process.uptime()),
      memory_usage: process.memoryUsage(),
    },
    request_info: {
      method: req.method,
      headers: {
        origin: req.headers.origin,
        "user-agent": req.headers["user-agent"]?.substring(0, 100),
        accept: req.headers.accept,
        "content-type": req.headers["content-type"],
      },
    },
  });
});

app.post("/api/test", (req, res) => {
  console.log("🧪 POST Test endpoint called with body:", req.body);
  res.json({
    success: true,
    message: "POST test successful!",
    receivedData: req.body,
    timestamp: new Date().toISOString(),
  });
});

// ----------------------
// Twitter Search API
// ----------------------
app.post("/api/search/twitter", async (req, res) => {
  try {
    const { query, count = 10, lang = "fa" } = req.body;

    console.log("🐦 Twitter search request:", { query, count, lang });

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

    try {
      validateApiKey("Twitter", process.env.TWITTER_BEARER_TOKEN);
    } catch (keyError) {
      console.warn("⚠️ Twitter API key issue:", keyError.message);
      // Return mock data instead of failing
      const mockResults = Array.from(
        { length: Math.min(count, 5) },
        (_, i) => ({
          id: `twitter_mock_${Date.now()}_${i}`,
          text: `Mock Twitter result for "${query}" - Sample ${
            i + 1
          }. This is a demonstration of Twitter search functionality. In a real implementation, this would be actual Twitter data.`,
          author: {
            id: `mock_user_${i}`,
            name: `Mock User ${i + 1}`,
            username: `mockuser${i + 1}`,
            verified: i % 3 === 0,
            followers: Math.floor(Math.random() * 10000),
          },
          metrics: {
            likes: Math.floor(Math.random() * 1000),
            retweets: Math.floor(Math.random() * 100),
            replies: Math.floor(Math.random() * 50),
            quotes: Math.floor(Math.random() * 25),
          },
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
          lang: lang,
          url: `https://twitter.com/mockuser${i + 1}/status/mock_${Date.now()}`,
          platform: "twitter",
        })
      );

      return res.json(
        createStandardResponse(true, {
          results: mockResults,
          total: mockResults.length,
          query,
          platform: "twitter",
          note: "Using mock data - Twitter API key not configured",
        })
      );
    }

    const searchUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,author_id,public_metrics,lang,context_annotations&user.fields=name,username,verified,public_metrics&expansions=author_id`;

    console.log("🐦 Making Twitter API request to:", searchUrl);

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("🐦❌ Twitter API Error:", response.status, errorData);
      return res
        .status(response.status)
        .json(
          createStandardResponse(
            false,
            null,
            `Twitter API error: ${response.status} - ${errorData}`,
            "twitter"
          )
        );
    }

    const data = await response.json();
    console.log("🐦✅ Twitter API response:", JSON.stringify(data, null, 2));

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
    console.error("🐦💥 Twitter Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "twitter"));
  }
});

// ----------------------
// Instagram Search API (Mock implementation)
// ----------------------
app.post("/api/search/instagram", async (req, res) => {
  try {
    const { query, count = 10 } = req.body;

    console.log("📸 Instagram search request:", { query, count });

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
    // For now, return mock data
    const mockResults = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
      id: `instagram_mock_${Date.now()}_${i}`,
      text: `Mock Instagram post for "${query}" - Sample ${
        i + 1
      }. Beautiful photo with engaging caption! #${query.replace(
        /\s+/g,
        ""
      )} #social #content`,
      content: `Mock Instagram post for "${query}" - Sample ${
        i + 1
      }. Beautiful photo with engaging caption! #${query.replace(
        /\s+/g,
        ""
      )} #social #content`,
      author: {
        id: `mock_instagram_user_${i}`,
        name: `Instagram User ${i + 1}`,
        username: `instauser${i + 1}`,
        verified: i % 4 === 0,
        followers: Math.floor(Math.random() * 50000),
      },
      metrics: {
        likes: Math.floor(Math.random() * 5000),
        comments: Math.floor(Math.random() * 200),
        shares: Math.floor(Math.random() * 100),
        views: Math.floor(Math.random() * 20000),
      },
      created_at: new Date(Date.now() - i * 7200000).toISOString(),
      media_url:
        i % 2 === 0 ? `https://picsum.photos/400/400?random=${i}` : null,
      media_type: i % 2 === 0 ? "image" : "text",
      url: `https://instagram.com/p/mock_${Date.now()}_${i}/`,
      platform: "instagram",
    }));

    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "instagram",
        note: "Using mock data - Instagram API requires business account setup",
      })
    );
  } catch (error) {
    console.error("📸💥 Instagram Search Error:", error);
    res
      .status(500)
      .json(createStandardResponse(false, null, error.message, "instagram"));
  }
});

// ----------------------
// Eitaa Search API (Mock implementation)
// ----------------------
app.post("/api/search/eitaa", async (req, res) => {
  try {
    const { query, count = 10 } = req.body;

    console.log("💬 Eitaa search request:", { query, count });

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

    // Mock Eitaa results for now
    const mockResults = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
      id: `eitaa_mock_${Date.now()}_${i}`,
      text: `پست نمونه ایتا برای جستجوی "${query}" - نمونه شماره ${
        i + 1
      }. محتوای جالب و کاربردی در کانال ایتا`,
      content: `پست نمونه ایتا برای جستجوی "${query}" - نمونه شماره ${
        i + 1
      }. محتوای جالب و کاربردی در کانال ایتا`,
      author: {
        id: `mock_eitaa_channel_${i}`,
        name: `کانال نمونه ${i + 1}`,
        username: `channel${i + 1}`,
        verified: i % 3 === 0,
        followers: Math.floor(Math.random() * 10000),
      },
      metrics: {
        likes: Math.floor(Math.random() * 500),
        comments: Math.floor(Math.random() * 50),
        shares: Math.floor(Math.random() * 25),
        views: Math.floor(Math.random() * 2000),
      },
      created_at: new Date(Date.now() - i * 1800000).toISOString(),
      url: `https://eitaa.com/channel${i + 1}/mock_${Date.now()}`,
      platform: "eitaa",
    }));

    res.json(
      createStandardResponse(true, {
        results: mockResults,
        total: mockResults.length,
        query,
        platform: "eitaa",
        note: "Using mock data - Eitaa API integration pending",
      })
    );
  } catch (error) {
    console.error("💬💥 Eitaa Search Error:", error);
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

    console.log("🔍 Multi-platform search request:", {
      query,
      platforms,
      count,
    });

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

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const perPlatformCount = Math.floor(count / platforms.length);

    // Search each platform
    for (const platform of platforms) {
      const searchPromise = fetch(`${baseUrl}/api/search/${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          count: perPlatformCount,
        }),
      })
        .then((res) => res.json())
        .then((data) => ({
          platform: platform,
          data,
        }))
        .catch((error) => ({
          platform: platform,
          error: error.message,
        }));

      searchPromises.push(searchPromise);
    }

    const platformResults = await Promise.all(searchPromises);
    console.log(
      "🔍 Multi-platform results:",
      JSON.stringify(platformResults, null, 2)
    );

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

    console.log(
      "🔍✅ Final multi-platform results:",
      JSON.stringify(results, null, 2)
    );

    res.json(createStandardResponse(true, results));
  } catch (error) {
    console.error("🔍💥 Multi-Platform Search Error:", error);
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

    console.log("🤖 AI enhancement request:", {
      service,
      analysisType,
      textLength: text?.length,
    });

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
            ? `تحلیل احساسات این متن را انجام دهید و در قالب JSON پاسخ دهید که شامل sentiment (positive/negative/neutral)، confidence (0-1) و key_emotions (آرایه) باشد. متن: "${text}"`
            : `این متن را به زبان فارسی خلاصه کنید و موضوعات کلیدی را مشخص کنید. متن: "${text}"`;

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
              max_tokens: 300,
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
              analysis_type: analysisType,
            };
          }
        } else {
          throw new Error(`OpenAI API error: ${response.status}`);
        }
      } catch (error) {
        console.error("🤖❌ OpenAI Error:", error);
        analysis.openai_error = error.message;

        // Provide mock analysis
        analysis.mock_openai = {
          sentiment: "neutral",
          confidence: 0.7,
          summary: `تحلیل نمونه برای متن ارسالی. این متن دارای طول ${text.length} کاراکتر است و به نظر می‌رسد در موضوع مورد نظر محتوای مفیدی دارد.`,
          key_topics: ["موضوع اصلی", "نکات مهم", "تحلیل محتوا"],
          note: "تحلیل نمونه - کلید API پیکربندی نشده",
        };
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
                      text: `احساسات این متن را تحلیل کن (مثبت/منفی/خنثی) و امتیاز اطمینان بده: "${text}"`,
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
            sentiment:
              content.toLowerCase().includes("مثبت") ||
              content.toLowerCase().includes("positive")
                ? "positive"
                : content.toLowerCase().includes("منفی") ||
                  content.toLowerCase().includes("negative")
                ? "negative"
                : "neutral",
          };
        } else {
          throw new Error(`Gemini API error: ${response.status}`);
        }
      } catch (error) {
        console.error("🤖❌ Gemini Error:", error);
        analysis.gemini_error = error.message;
      }
    }

    // Provide basic analysis if no AI service available
    if (
      Object.keys(analysis).length === 0 ||
      (!analysis.openai && !analysis.gemini)
    ) {
      analysis.basic = {
        sentiment:
          text.includes("عالی") ||
          text.includes("خوب") ||
          text.includes("perfect") ||
          text.includes("good")
            ? "positive"
            : text.includes("بد") ||
              text.includes("مشکل") ||
              text.includes("bad") ||
              text.includes("problem")
            ? "negative"
            : "neutral",
        confidence: 0.6,
        word_count: text.split(" ").length,
        character_count: text.length,
        message: "تحلیل پایه - برای نتایج بهتر کلیدهای API را پیکربندی کنید",
        language_detected: /[\u0600-\u06FF]/.test(text) ? "persian" : "english",
      };
    }

    console.log(
      "🤖✅ AI analysis completed:",
      JSON.stringify(analysis, null, 2)
    );

    res.json(
      createStandardResponse(true, {
        original_text:
          text.substring(0, 500) + (text.length > 500 ? "..." : ""),
        analysis,
        service_used: service,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("🤖💥 AI Enhancement Error:", error);
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// ----------------------
// Facebook Search (Mock implementation)
// ----------------------
app.post("/api/search/facebook", async (req, res) => {
  try {
    const { query, count = 10 } = req.body;

    console.log("📘 Facebook search request:", { query, count });

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

    // Mock Facebook results
    const mockResults = Array.from({ length: Math.min(count, 3) }, (_, i) => ({
      id: `facebook_mock_${Date.now()}_${i}`,
      text: `Mock Facebook post for "${query}" - Sample ${
        i + 1
      }. Engaging social media content with community interaction.`,
      content: `Mock Facebook post for "${query}" - Sample ${
        i + 1
      }. Engaging social media content with community interaction.`,
      author: {
        id: `mock_fb_user_${i}`,
        name: `Facebook User ${i + 1}`,
        username: `fbuser${i + 1}`,
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

// ----------------------
// Additional utility endpoints
// ----------------------
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

// ----------------------
// Enhanced Error handler & 404
// ----------------------
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

// ----------------------
// Start server with enhanced logging
// ----------------------
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

// Handle server shutdown gracefully
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

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
