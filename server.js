const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration for Vercel frontend
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://newkavosh.vercel.app",
      process.env.FRONTEND_URL,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Kavosh Backend API",
  });
});

// Instagram Search API
app.post("/api/search/instagram", async (req, res) => {
  try {
    const { query, options = {} } = req.body;

    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    const generateId = () => Math.random().toString(36).substring(2, 15);

    const mockResults = Array.from({ length: options?.limit || 8 }, (_, i) => ({
      id: generateId(),
      media_type: i % 4 === 0 ? "VIDEO" : "IMAGE",
      caption: `محتوای جذاب درباره ${query}! این پست واقعاً جذاب است و مخاطبان زیادی را به خود جلب کرده. #${query.replace(
        /\s+/g,
        ""
      )} #اینستاگرام #محتوا`,
      media_url: `https://picsum.photos/400/400?random=${i + Date.now()}`,
      permalink: `https://www.instagram.com/p/${generateId()}/`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      like_count: Math.floor(Math.random() * 2000) + 100,
      comments_count: Math.floor(Math.random() * 200) + 10,
      user: {
        id: generateId(),
        username: `user_${generateId().substring(0, 8)}`,
        profile_picture_url: `https://picsum.photos/150/150?random=${i + 50}`,
      },
    }));

    res.status(200).json({
      success: true,
      data: mockResults,
      platform: "instagram",
      query,
    });
  } catch (error) {
    console.error("Instagram API Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Twitter Search API
app.post("/api/search/twitter", async (req, res) => {
  try {
    const { query, options = {} } = req.body;

    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (!twitterBearerToken) {
      console.error("Twitter Bearer Token not found");
      return res.status(500).json({
        success: false,
        message: "Twitter Bearer Token is not configured",
      });
    }

    const searchParams = new URLSearchParams({
      query: query,
      "tweet.fields": "created_at,author_id,public_metrics,attachments",
      expansions: "author_id,attachments.media_keys",
      "media.fields": "url,preview_image_url",
      max_results: options?.max_results || "20",
    });

    const twitterApiUrl = `https://api.twitter.com/2/tweets/search/recent?${searchParams.toString()}`;

    const apiResponse = await fetch(twitterApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${twitterBearerToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("Twitter API Error:", errorText);
      return res.status(apiResponse.status).json({
        success: false,
        message: "Failed to fetch from Twitter API",
        details: errorText,
        status: apiResponse.status,
      });
    }

    const data = await apiResponse.json();

    res.status(200).json({
      success: true,
      data: data.data || [],
      includes: data.includes || {},
      meta: data.meta || {},
      platform: "twitter",
      query,
    });
  } catch (error) {
    console.error("Twitter API Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Eitaa Search API
app.post("/api/search/eitaa", async (req, res) => {
  try {
    const { query, options = {} } = req.body;

    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    const eitaaApiToken = process.env.EITAA_TOKEN;

    // Generate mock data for Eitaa
    const mockData = Array.from({ length: 15 }, (_, i) => ({
      message_id: i + 1,
      text: `محتوای نمونه درباره ${query} - پیام شماره ${
        i + 1
      } که برای نمایش عملکرد سیستم استفاده می‌شود.`,
      date: Math.floor(Date.now() / 1000) - i * 3600,
      chat: {
        username: `channel_${i + 1}`,
        title: `کانال نمونه ${i + 1}`,
        type: "channel",
      },
      views: Math.floor(Math.random() * 10000) + 1000,
      forwards: Math.floor(Math.random() * 100) + 10,
      photo: i % 3 === 0 ? { file_id: `photo_${i}` } : null,
      video: i % 5 === 0 ? { file_id: `video_${i}` } : null,
    }));

    res.status(200).json({
      success: true,
      data: mockData,
      platform: "eitaa",
      query,
    });
  } catch (error) {
    console.error("Eitaa API Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// AI Enhancement API
app.post("/api/ai/enhance", async (req, res) => {
  try {
    const { prompt, provider, searchResults } = req.body;

    if (!prompt || !provider) {
      return res.status(400).json({
        success: false,
        message: "Missing prompt or provider in request body",
      });
    }

    let analysisText = "";

    if (provider === "openai") {
      const openAIApiKey = process.env.OPENAI_API_KEY;

      if (!openAIApiKey) {
        analysisText = generateFallbackAnalysis(prompt);
      } else {
        try {
          const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openAIApiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 1500,
              }),
            }
          );

          if (!response.ok) {
            console.error("OpenAI API Error:", await response.text());
            analysisText = generateFallbackAnalysis(prompt);
          } else {
            const data = await response.json();
            analysisText =
              data.choices[0]?.message?.content ||
              generateFallbackAnalysis(prompt);
          }
        } catch (error) {
          console.error("OpenAI request error:", error);
          analysisText = generateFallbackAnalysis(prompt);
        }
      }
    } else if (provider === "gemini") {
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (!geminiApiKey) {
        analysisText = generateFallbackAnalysis(prompt);
      } else {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
              }),
            }
          );

          if (!response.ok) {
            console.error("Gemini API Error:", await response.text());
            analysisText = generateFallbackAnalysis(prompt);
          } else {
            const data = await response.json();
            analysisText =
              data.candidates?.[0]?.content?.parts?.[0]?.text ||
              generateFallbackAnalysis(prompt);
          }
        } catch (error) {
          console.error("Gemini request error:", error);
          analysisText = generateFallbackAnalysis(prompt);
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported AI provider: ${provider}`,
      });
    }

    res.status(200).json({
      success: true,
      analysis: analysisText,
      provider,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI Enhancement Error:", error);
    const fallbackAnalysis = generateFallbackAnalysis(
      req.body?.prompt || "جستجو"
    );
    res.status(500).json({
      success: false,
      analysis: fallbackAnalysis,
      error: error.message,
    });
  }
});

// Fallback analysis generator
function generateFallbackAnalysis(prompt) {
  return `## تحلیل خودکار نتایج

### 📊 خلاصه
تحلیل بر اساس سیستم داخلی انجام شده است.

### 🎯 نکات کلیدی
- جستجو با موفقیت انجام شد
- نتایج آماده نمایش هستند
- سیستم در حالت عادی عمل می‌کند

### 💡 توصیه‌ها
1. بررسی کلیدهای API برای تحلیل دقیق‌تر
2. استفاده از فیلترهای پیشرفته
3. صادرات نتایج برای تحلیل بیشتر

*این تحلیل به صورت خودکار تولید شده است.*`;
}

// Multi-platform search endpoint
app.post("/api/search/multi", async (req, res) => {
  try {
    const {
      query,
      platforms,
      options = {},
      useAI = false,
      aiProvider = "openai",
    } = req.body;

    if (!query || !platforms || platforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Query and platforms are required",
      });
    }

    let allResults = [];

    // Search each platform
    for (const platform of platforms) {
      try {
        let platformResults = [];

        switch (platform) {
          case "instagram":
            // You can call your specific Instagram search logic here
            platformResults = await searchInstagram(query, options);
            break;
          case "twitter":
            platformResults = await searchTwitter(query, options);
            break;
          case "eitaa":
            platformResults = await searchEitaa(query, options);
            break;
          default:
            platformResults = generateMockResults(
              platform,
              query,
              options?.limit || 7
            );
        }

        allResults = [...allResults, ...platformResults];
      } catch (error) {
        console.error(`Error searching ${platform}:`, error);
        // Continue with other platforms even if one fails
      }
    }

    let aiInsight = null;

    // AI Enhancement if requested
    if (useAI && allResults.length > 0) {
      try {
        const aiPrompt = createAIPrompt(query, platforms, allResults);
        const aiResponse = await enhanceWithAI(aiPrompt, aiProvider);
        aiInsight = aiResponse;
      } catch (error) {
        console.error("AI Enhancement failed:", error);
      }
    }

    res.status(200).json({
      success: true,
      data: allResults,
      aiInsight,
      query,
      platforms,
      totalResults: allResults.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Multi-platform search error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Helper functions
async function searchInstagram(query, options) {
  const generateId = () => Math.random().toString(36).substring(2, 15);

  return Array.from({ length: options?.limit || 8 }, (_, i) => ({
    id: generateId(),
    platform: "instagram",
    media_type: i % 4 === 0 ? "VIDEO" : "IMAGE",
    content: `محتوای جذاب درباره ${query}! این پست واقعاً جذاب است و مخاطبان زیادی را به خود جلب کرده.`,
    media_url: `https://picsum.photos/400/400?random=${i + Date.now()}`,
    permalink: `https://www.instagram.com/p/${generateId()}/`,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    engagement: {
      likes: Math.floor(Math.random() * 2000) + 100,
      comments: Math.floor(Math.random() * 200) + 10,
      shares: Math.floor(Math.random() * 100) + 5,
    },
    author: `user_${generateId().substring(0, 8)}`,
    sentiment: ["positive", "neutral", "negative"][
      Math.floor(Math.random() * 3)
    ],
    mediaType: i % 4 === 0 ? "video" : "image",
  }));
}

async function searchTwitter(query, options) {
  const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

  if (!twitterBearerToken) {
    return generateMockResults("twitter", query, options?.limit || 7);
  }

  try {
    const searchParams = new URLSearchParams({
      query: query,
      "tweet.fields": "created_at,author_id,public_metrics,attachments",
      expansions: "author_id,attachments.media_keys",
      "media.fields": "url,preview_image_url",
      max_results: options?.max_results || "20",
    });

    const apiResponse = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${searchParams.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${twitterBearerToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!apiResponse.ok) {
      throw new Error(`Twitter API error: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();

    return formatTwitterResults(data.data || [], data.includes || {});
  } catch (error) {
    console.error("Twitter API Error:", error);
    return generateMockResults("twitter", query, options?.limit || 7);
  }
}

async function searchEitaa(query, options) {
  const mockData = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    platform: "eitaa",
    message_id: i + 1,
    content: `محتوای نمونه درباره ${query} - پیام شماره ${
      i + 1
    } که برای نمایش عملکرد سیستم استفاده می‌شود.`,
    date: Math.floor(Date.now() / 1000) - i * 3600,
    chat: {
      username: `channel_${i + 1}`,
      title: `کانال نمونه ${i + 1}`,
      type: "channel",
    },
    engagement: {
      views: Math.floor(Math.random() * 10000) + 1000,
      forwards: Math.floor(Math.random() * 100) + 10,
      likes: Math.floor(Math.random() * 500) + 50,
      comments: Math.floor(Math.random() * 100) + 10,
    },
    photo: i % 3 === 0 ? { file_id: `photo_${i}` } : null,
    video: i % 5 === 0 ? { file_id: `video_${i}` } : null,
    author: `@channel_${i + 1}`,
    sentiment: ["positive", "neutral", "negative"][
      Math.floor(Math.random() * 3)
    ],
    mediaType: i % 5 === 0 ? "video" : i % 3 === 0 ? "image" : "text",
  }));

  return mockData;
}

function formatTwitterResults(tweets, includes) {
  return tweets.map((tweet) => ({
    id: tweet.id,
    platform: "twitter",
    content: tweet.text,
    author:
      includes?.users?.find((u) => u.id === tweet.author_id)?.username ||
      "@unknown",
    date: new Date(tweet.created_at).toLocaleDateString("fa-IR"),
    engagement: {
      likes: tweet.public_metrics?.like_count || 0,
      comments: tweet.public_metrics?.reply_count || 0,
      shares: tweet.public_metrics?.retweet_count || 0,
    },
    sentiment: analyzeSentiment(tweet.text),
    originalUrl: `https://twitter.com/i/status/${tweet.id}`,
    mediaType: "text",
  }));
}

function generateMockResults(platform, query, count = 7) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${platform}_${i + 1}`,
    platform,
    content: `محتوای مرتبط با "${query}" از ${platform} - نمونه شماره ${i + 1}`,
    author: `@user${i + 1}`,
    date: `${i + 1} ساعت پیش`,
    engagement: {
      likes: Math.floor(Math.random() * 1000) + 50,
      comments: Math.floor(Math.random() * 100) + 10,
      shares: Math.floor(Math.random() * 50) + 5,
    },
    sentiment: ["positive", "neutral", "negative"][
      Math.floor(Math.random() * 3)
    ],
    media: i % 3 === 0 ? `https://picsum.photos/400/300?random=${i}` : null,
    originalUrl: `https://${platform}.com/post/${i + 1}`,
    mediaType: i % 4 === 0 ? "video" : i % 3 === 0 ? "image" : "text",
  }));
}

function analyzeSentiment(text) {
  const positiveWords = ["عالی", "خوب", "بهترین", "موفق", "خوشحال", "عاشق"];
  const negativeWords = ["بد", "ضعیف", "ناراحت", "مشکل", "غلط", "متنفر"];

  const positive = positiveWords.some((word) => text.includes(word));
  const negative = negativeWords.some((word) => text.includes(word));

  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "neutral";
}

function createAIPrompt(query, platforms, results) {
  const resultsContext = results.slice(0, 5).map((r) => ({
    platform: r.platform,
    content: r.content?.substring(0, 200) || "",
    sentiment: r.sentiment,
    engagement: r.engagement,
  }));

  return `تحلیل نتایج جستجوی "${query}" در پلتفرم‌های ${platforms.join(", ")}:

نتایج نمونه:
${JSON.stringify(resultsContext, null, 2)}

لطفاً تحلیل جامعی از:
1. روند کلی محتوا
2. احساسات غالب
3. میزان تعامل
4. توصیه‌هایی برای بهبود جستجو
ارائه دهید.`;
}

async function enhanceWithAI(prompt, provider) {
  if (provider === "openai") {
    const openAIApiKey = process.env.OPENAI_API_KEY;

    if (!openAIApiKey) {
      return generateFallbackAnalysis(prompt);
    }

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAIApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return (
        data.choices[0]?.message?.content || generateFallbackAnalysis(prompt)
      );
    } catch (error) {
      console.error("OpenAI Enhancement Error:", error);
      return generateFallbackAnalysis(prompt);
    }
  } else if (provider === "gemini") {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return generateFallbackAnalysis(prompt);
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return (
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        generateFallbackAnalysis(prompt)
      );
    } catch (error) {
      console.error("Gemini Enhancement Error:", error);
      return generateFallbackAnalysis(prompt);
    }
  }

  return generateFallbackAnalysis(prompt);
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kavosh Backend Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`⚡ Frontend URL: ${process.env.FRONTEND_URL || "Not set"}`);
});
