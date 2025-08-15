// server.js - Final version with dynamic key rotation and live Telegram search
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

// --- DYNAMIC API Key Manager ---
// This function finds all keys for a service (e.g., TWITTER_BEARER_TOKEN, TWITTER_BEARER_TOKEN_2)
const loadApiKeys = (baseName) => {
  return Object.keys(process.env)
    .filter((key) => key.startsWith(baseName))
    .sort() // Ensures correct order (TOKEN, TOKEN_2, etc.)
    .map((key) => process.env[key])
    .filter(Boolean); // Removes any empty keys
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
const telegramApiId = parseInt(process.env.TELEGRAM_API_ID);
const telegramApiHash = process.env.TELEGRAM_API_HASH;
const telegramSession = new StringSession(process.env.TELEGRAM_SESSION || "");

const telegramClient = new TelegramClient(
  telegramSession,
  telegramApiId,
  telegramApiHash,
  {
    connectionRetries: 5,
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

    if (!process.env.TELEGRAM_SESSION) {
      console.log("\n--- IMPORTANT ---");
      console.log(
        "COPY THIS SESSION STRING and add it to your environment variables as TELEGRAM_SESSION:"
      );
      console.log(telegramClient.session.save());
      console.log("-----------------\n");
    }
  } catch (err) {
    console.error("🔴 Failed to connect to Telegram:", err.message);
  }
})();

// --- Middleware Setup ---
app.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })
);

const allowedOrigins = [
  "http://localhost:3000",
  "https://newkavosh.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};
app.use(cors(corsOptions));

app.use(express.json());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

// --- Helper Functions ---
const createStandardResponse = (success, data = null, message = null) => ({
  success,
  data,
  message,
});

// --- Live Telegram Search Function ---
async function makeTelegramSearch(query, count) {
  if (!telegramClient.connected) {
    throw new Error(
      "Telegram client is not connected. Please check server logs."
    );
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
        author: `Channel ID: ${channelId || "Unknown"}`,
        metrics: { views: msg.views || 0, likes: 0, comments: 0, shares: 0 },
        created_at: new Date(msg.date * 1000).toISOString(),
        url: channelId ? `https://t.me/${channelId}/${msg.id}` : "#",
        platform: "telegram",
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
    throw new Error("Failed to perform search on Telegram.");
  }
}

// --- Twitter Search Function (with key rotation) ---
async function makeTwitterSearch(query, count) {
  const maxRetries = (apiKeys.twitter || []).length || 1;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getKey("twitter");
    if (!currentKey) throw new Error("No valid Twitter API keys configured.");

    const twitterUrl = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(
      query
    )}&max_results=${Math.min(
      count,
      100
    )}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,verified`;
    const response = await fetch(twitterUrl, {
      headers: { Authorization: `Bearer ${currentKey}` },
    });

    if (response.status === 429 || response.status === 401) {
      keyManager.rotateKey("twitter");
      if (attempt === maxRetries - 1)
        throw new Error(
          `Twitter API Error: ${response.status} - All keys failed.`
        );
      continue;
    }
    if (!response.ok) throw new Error(`Twitter API Error: ${response.status}`);
    const data = await response.json();
    const users =
      data.includes?.users?.reduce(
        (acc, user) => ({ ...acc, [user.id]: user }),
        {}
      ) || {};
    const results = (data.data || []).map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      author: users[tweet.author_id] || { name: "Unknown" },
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

// Mock results for other platforms
function createMockResults(platform, query, count) {
  const results = Array.from({ length: Math.min(count, 8) }, (_, i) => ({
    id: `mock_${platform}_${Date.now()}_${i}`,
    text: `محتوای آزمایشی از ${platform} برای "${query}" - نتیجه ${i + 1}`,
    author: { username: `user_${i}`, name: `کاربر ${i}` },
    metrics: {
      like_count: Math.floor(Math.random() * 100),
      reply_count: Math.floor(Math.random() * 20),
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

// --- API Endpoints ---
app.get("/health", (req, res) => res.json({ status: "healthy" }));

app.post("/api/search/multi", async (req, res) => {
  const { query, platforms = [], count = 20 } = req.body;
  if (!query)
    return res
      .status(400)
      .json(createStandardResponse(false, null, "Query is required"));

  const searchPromises = platforms.map((platform) => {
    switch (platform) {
      case "twitter":
        return makeTwitterSearch(query, count);
      case "telegram":
        return makeTelegramSearch(query, count);
      default:
        return createMockResults(platform, query, count);
    }
  });

  try {
    const results = await Promise.all(
      searchPromises.map((p) =>
        p.catch((e) => ({
          success: false,
          error: e.message,
          data: { platform: e.platform || "unknown" },
        }))
      )
    );
    const platformResults = {};
    let totalResults = 0;
    results.forEach((result) => {
      if (result && result.data) {
        const platformName = result.data.platform;
        platformResults[platformName] = result;
        if (result.success) {
          totalResults += result.data.total;
        }
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
    res.status(500).json(createStandardResponse(false, null, error.message));
  }
});

// --- AI Enhance Endpoint (with key rotation) ---
app.post("/api/ai/enhance", async (req, res) => {
  const { text, query, service = "openai" } = req.body;
  if (!text) {
    return res
      .status(400)
      .json(
        createStandardResponse(false, null, "Text is required for AI analysis.")
      );
  }

  if (service !== "openai") {
    return res
      .status(400)
      .json(
        createStandardResponse(
          false,
          null,
          "Only OpenAI is supported for AI enhancement currently."
        )
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
        continue;
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

app.listen(PORT, () => {
  console.log(`🚀 Kavosh Backend Server is running on port ${PORT}`);
});
