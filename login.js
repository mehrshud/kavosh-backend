// login.js - Run this file once to get your Telegram session string.
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession("");

(async () => {
  console.log("Starting Telegram login process...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: process.env.TELEGRAM_PHONE_NUMBER,
    password: async () => await input.text("Please enter your 2FA password: "),
    phoneCode: async () =>
      await input.text("Please enter the code you received: "),
    onError: (err) => console.log(err),
  });

  console.log("\n✅ You are now logged in.");
  console.log("\n--- IMPORTANT ---");
  console.log(
    "COPY THIS SESSION STRING and add it to your Railway environment variables as TELEGRAM_SESSION:"
  );
  console.log(client.session.save());
  console.log("-----------------\n");

  await client.disconnect();
  process.exit(0);
})();
