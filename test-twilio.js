require("dotenv").config();

const twilio = require("twilio");

console.log("SID:", process.env.TWILIO_ACCOUNT_SID);
console.log(
  "TOKEN:",
  process.env.TWILIO_AUTH_TOKEN ? "Loaded" : "Missing"
);
console.log("PHONE:", process.env.TWILIO_PHONE_NUMBER);

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function test() {
  try {
    const message = await client.messages.create({
      body: "Hello from HubSpot Bulk SMS 🚀",
      from: process.env.TWILIO_PHONE_NUMBER,
      to: "+919793041106", // Your verified number
    });

    console.log("✅ SMS Sent");
    console.log("SID:", message.sid);
  } catch (err) {
    console.error("❌ Twilio Error");
    console.error(err.status);
    console.error(err.code);
    console.error(err.message);
    console.error(err.moreInfo);
  }
}

test();