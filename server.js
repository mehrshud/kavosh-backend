// server.js - Fixed CORS and error handling
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
require("dotenv").config();

const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS FIX - This is the main issue ---
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://newkavosh.vercel.app",
    "https://kavosh-frontend.vercel.app", // Add any other domains
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

// Apply CORS before other middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

// --- Middleware Setup ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Helmet with relaxed settings
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased limit
  message: "Too many requests from this IP",
});
app.use("/api", limiter);

// --- DYNAMIC API Key Manager ---
const loadApiKeys = (baseName) => {
  return Object.keys(process.env)
    .filter((key) => key.startsWith(baseName))
    .sort()
    .map((key) => process.env[key])
    .filter(Boolean);
};

const apiKeys = {
  openai: loadApiKeys("OPENAI_API_KEY"),
  gemini: loadApiKeys("GEMINI_API_KEY"),
  twitter: loadApiKeys("TWITTER_BEARER_TOKEN"),
};

const keyManager = {
  indices: { openai: 0, gemini: 0, twitter: 0 },
  getKey: function (service) {
    const keys = apiKeys[service];
    if (!keys || keys.length === 0) return null;
    return keys[this.indices[service]];
  },
  rotateKey: function (service) {
    const keys = apiKeys[service];
    if (!keys || keys.length < 2) return;
    this.indices[service] = (this.indices[service] + 1) % keys.length;
    console.log(
      `🔄 Rotated ${service} key. New index: ${this.indices[service]}`
    );
  },
};

console.log(`🔑 Loaded ${apiKeys.twitter.length} Twitter keys.`);
console.log(`🔑 Loaded ${apiKeys.openai.length} OpenAI keys.`);
console.log(`🔑 Loaded ${apiKeys.gemini.length} Gemini keys.`);

// --- Telegram Client Setup ---
let telegramClient = null;
const telegramApiId = parseInt(process.env.TELEGRAM_API_ID);
const telegramApiHash = process.env.TELEGRAM_API_HASH;

// Only initialize Telegram if credentials are available
if (telegramApiId && telegramApiHash) {
  const telegramSession = new StringSession(process.env.TELEGRAM_SESSION || "");
  telegramClient = new TelegramClient(
    telegramSession,
    telegramApiId,
    telegramApiHash,
    {
      connectionRetries: 3,
      timeout: 10000,
    }
  );

  (async () => {
    try {
      console.log("Attempting to connect to Telegram...");
      await telegramClient.start({
        phoneNumber: process.env.TELEGRAM_PHONE_NUMBER,
        password: async () =>
          await input.text("Please enter your 2FA password: "),
        phoneCode: async () =>
          await input.text("Please enter the code you received: "),
        onError: (err) => console.error("Telegram connection error:", err),
      });
      console.log("✅ Telegram client is connected and ready.");
    } catch (err) {
      console.error("🔴 Failed to connect to Telegram:", err.message);
      telegramClient = null; // Disable telegram if connection fails
    }
  })();
} else {
  console.log(
    "⚠️ Telegram credentials not provided. Telegram search will return mock data."
  );
}

// --- Helper Functions ---
const createStandardResponse = (success, data = null, message = null) => ({
  success,
  data,
  message,
  timestamp: new Date().toISOString(),
});

// --- Live Telegram Search Function ---
async function makeTelegramSearch(query, count) {
  if (!telegramClient || !telegramClient.connected) {
    console.log("⚠️ Telegram not available, returning mock data");
    return createMockResults("telegram", query, count);
  }

  try {
    const results = await telegramClient.invoke(
      new Api.messages.SearchGlobal({
        q: query,
        limit: count,
        filter: new Api.InputMessagesFilterEmpty(),
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
      })
    );

    const formattedMessages = results.messages.map((msg) => {
      const channelId = msg.peerId?.channelId?.toString();
      return {
        id: `telegram_${channelId}_${msg.id}`,
        text: msg.message || "[Media content]",
        content: msg.message || "[Media content]",
        author: `Channel ${channelId || "Unknown"}`,
        metrics: {
          views: msg.views || 0,
          likes: 0,
          comments: 0,
          shares: 0,
          like_count: 0,
          reply_count: 0,
          retweet_count: 0,
          impression_count: msg.views || 0,
        },
        created_at: new Date(msg.date * 1000).toISOString(),
        date: new Date(msg.date * 1000).toISOString(),
        url: channelId ? `https://t.me/${channelId}/${msg.id}` : "#",
        platform: "telegram",
        sentiment: ["positive", "neutral", "negative"][
          Math.floor(Math.random() * 3)
        ],
        media_url: null,
        media_type: "text",
      };
    });

    return {
      success: true,
      data: {
        results: formattedMessages,
        total: formattedMessages.length,
        platform: "telegram",
      },
    };
  } catch (error) {
    console.error("🔴 Telegram search API error:", error);
    // Return mock data if telegram fails
    return createMockResults("telegram", query, count);
  }
}

// --- Twitter Search Function ---
async function makeTwitterSearch(query, count) {
  const maxRetries = Math.max((apiKeys.twitter || []).length, 1);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getKey("twitter");
    if (!currentKey) {
      console.log("⚠️ No Twitter API keys, returning mock data");
      return createMockResults("twitter", query, count);
    }

    try {
      const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
        query
      )}&max_results=${Math.min(
        count,
        100
      )}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,verified`;

      const response = await fetch(twitterUrl, {
        headers: { Authorization: `Bearer ${currentKey}` },
        timeout: 15000,
      });

      if (response.status === 429 || response.status === 401) {
        keyManager.rotateKey("twitter");
        if (attempt === maxRetries - 1) {
          return createMockResults("twitter", query, count);
        }
        continue;
      }

      if (!response.ok) {
        throw new Error(`Twitter API Error: ${response.status}`);
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
      console.error(`🔴 Twitter attempt ${attempt + 1} failed:`, error.message);
      if (attempt === maxRetries - 1) {
        return createMockResults("twitter", query, count);
      }
    }
  }
}

// Mock results for platforms without API access
function createMockResults(platform, query, count) {
  const results = Array.from({ length: Math.min(count, 10) }, (_, i) => ({
    id: `mock_${platform}_${Date.now()}_${i}`,
    text: `نمونه محتوای ${platform} برای جستجوی "${query}" - پست شماره ${
      i + 1
    }. این محتوا نمونه‌ای است که نشان‌دهنده نحوه نمایش نتایج واقعی می‌باشد.`,
    content: `نمونه محتوای ${platform} برای جستجوی "${query}" - پست شماره ${
      i + 1
    }. این محتوا نمونه‌ای است که نشان‌دهنده نحوه نمایش نتایج واقعی می‌باشد.`,
    author: {
      username: `user_${platform}_${i}`,
      name: `کاربر ${i + 1}`,
    },
    metrics: {
      like_count: Math.floor(Math.random() * 500) + 10,
      reply_count: Math.floor(Math.random() * 50) + 1,
      retweet_count: Math.floor(Math.random() * 100) + 5,
      impression_count: Math.floor(Math.random() * 1000) + 100,
      likes: Math.floor(Math.random() * 500) + 10,
      comments: Math.floor(Math.random() * 50) + 1,
      shares: Math.floor(Math.random() * 100) + 5,
      views: Math.floor(Math.random() * 1000) + 100,
    },
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    date: new Date(Date.now() - i * 3600000).toISOString(),
    url: `#mock-${platform}-${i}`,
    platform: platform,
    sentiment: ["positive", "neutral", "negative"][
      Math.floor(Math.random() * 3)
    ],
    media_url:
      Math.random() > 0.7 ? `https://picsum.photos/400/300?random=${i}` : null,
    media_type: Math.random() > 0.7 ? "image" : "text",
  }));

  return {
    success: true,
    data: {
      results,
      total: results.length,
      platform: platform,
      note: `نمونه داده برای ${platform} - در نسخه کامل، داده‌های واقعی نمایش داده خواهد شد.`,
    },
  };
}

// --- API Endpoints ---

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      telegram:
        telegramClient && telegramClient.connected
          ? "connected"
          : "disconnected",
      twitter: apiKeys.twitter.length > 0 ? "configured" : "not configured",
      openai: apiKeys.openai.length > 0 ? "configured" : "not configured",
    },
  });
});

// Multi-platform search endpoint
app.post("/api/search/multi", async (req, res) => {
  try {
    const { query, platforms = [], count = 20 } = req.body;

    if (!query || !query.trim()) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Query is required and cannot be empty"
          )
        );
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "At least one platform must be specified"
          )
        );
    }

    console.log(
      `🔍 Searching for "${query}" across platforms: ${platforms.join(", ")}`
    );

    const searchPromises = platforms.map(async (platform) => {
      try {
        switch (platform.toLowerCase()) {
          case "twitter":
            return await makeTwitterSearch(query, count);
          case "telegram":
            return await makeTelegramSearch(query, count);
          case "instagram":
          case "facebook":
          case "eitaa":
          case "rubika":
            return createMockResults(platform, query, count);
          default:
            return {
              success: false,
              error: `Unsupported platform: ${platform}`,
              data: { platform: platform },
            };
        }
      } catch (error) {
        console.error(`Error searching ${platform}:`, error);
        return {
          success: false,
          error: error.message,
          data: { platform: platform },
        };
      }
    });

    const results = await Promise.allSettled(searchPromises);
    const platformResults = {};
    let totalResults = 0;

    results.forEach((result, index) => {
      const platformName = platforms[index];
      if (result.status === "fulfilled" && result.value) {
        platformResults[platformName] = result.value;
        if (result.value.success && result.value.data) {
          totalResults += result.value.data.total || 0;
        }
      } else {
        platformResults[platformName] = {
          success: false,
          error: result.reason?.message || "Search failed",
          data: { platform: platformName },
        };
      }
    });

    const response = createStandardResponse(true, {
      platforms: platformResults,
      total: totalResults,
      query: query.trim(),
      searchedPlatforms: platforms,
    });

    console.log(`✅ Search completed. Total results: ${totalResults}`);
    res.json(response);
  } catch (error) {
    console.error("🔴 Multi-search error:", error);
    res
      .status(500)
      .json(
        createStandardResponse(false, null, `Server error: ${error.message}`)
      );
  }
});

// AI Enhancement endpoint
app.post("/api/ai/enhance", async (req, res) => {
  try {
    const { text, query, service = "openai" } = req.body;

    if (!text || !text.trim()) {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Text is required for AI analysis."
          )
        );
    }

    if (service !== "openai") {
      return res
        .status(400)
        .json(
          createStandardResponse(
            false,
            null,
            "Only OpenAI is supported currently."
          )
        );
    }

    const maxRetries = Math.max((apiKeys.openai || []).length, 1);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentKey = keyManager.getKey("openai");
      if (!currentKey) {
        return res.json(
          createStandardResponse(true, {
            analysis: `تحلیل خودکار برای "${query}": متاسفانه سرویس تحلیل هوش مصنوعی در حال حاضر در دسترس نیست. با این حال، از نتایج جستجو می‌توان استنباط کرد که محتوای مرتبط با موضوع مورد نظر شما در پلتفرم‌های مختلف یافت شده است.`,
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
              Authorization: `Bearer ${currentKey}`,
            },
            body: JSON.stringify({
              model: "gpt-3.5-turbo",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful social media analyst. Analyze the following content and respond in Persian (Farsi).",
                },
                {
                  role: "user",
                  content: `لطفاً نتایج زیر را که مربوط به جستجوی "${query}" است تحلیل کن و خلاصه‌ای از نکات کلیدی و احساسات کلی ارائه ده:\n\n${text.substring(
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
          console.warn(`OpenAI key failed (${response.status}), rotating...`);
          keyManager.rotateKey("openai");
          if (attempt === maxRetries - 1) {
            return res.json(
              createStandardResponse(true, {
                analysis: `تحلیل خودکار: بر اساس نتایج جستجو برای "${query}"، محتوای متنوعی یافت شده است. لطفاً برای تحلیل دقیق‌تر، مجدداً تلاش کنید.`,
              })
            );
          }
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.json();
          throw new Error(
            errorBody.error?.message || `OpenAI API Error: ${response.status}`
          );
        }

        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content?.trim();

        return res.json(createStandardResponse(true, { analysis }));
      } catch (error) {
        console.error(`AI attempt ${attempt + 1} failed:`, error.message);
        if (attempt === maxRetries - 1) {
          return res.json(
            createStandardResponse(true, {
              analysis: `تحلیل خودکار برای "${query}": بر اساس داده‌های جمع‌آوری شده، نتایج متنوعی یافت شده است. برای دریافت تحلیل دقیق‌تر، لطفاً مجدداً تلاش کنید.`,
            })
          );
        }
      }
    }
  } catch (error) {
    console.error("🔴 AI enhancement error:", error);
    res
      .status(500)
      .json(
        createStandardResponse(
          false,
          null,
          `AI service error: ${error.message}`
        )
      );
  }
});

// Catch-all for 404s
app.use("*", (req, res) => {
  res
    .status(404)
    .json(
      createStandardResponse(
        false,
        null,
        `Endpoint not found: ${req.method} ${req.originalUrl}`
      )
    );
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("🔴 Global error:", error);
  res
    .status(500)
    .json(createStandardResponse(false, null, "Internal server error"));
});

// Handle process termination gracefully
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  if (telegramClient && telegramClient.connected) {
    await telegramClient.disconnect();
    console.log("✅ Telegram client disconnected");
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  if (telegramClient && telegramClient.connected) {
    await telegramClient.disconnect();
    console.log("✅ Telegram client disconnected");
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Kavosh Backend Server is running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${corsOptions.origin.join(", ")}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
});
