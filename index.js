require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("HubSpot OAuth Service is running.");
});

app.get("/oauth-callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  try {
    const response = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
        code,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("\n===== HUBSPOT TOKENS =====");
    console.log(response.data);
    console.log("==========================\n");

    res.send(`
      <h2>HubSpot App Installed Successfully</h2>
      <p>You can close this window.</p>
    `);
  } catch (error) {
    console.error(
      error.response?.data || error.message
    );

    res.status(500).send("OAuth token exchange failed.");
  }
});

app.listen(PORT, () => {
  console.log(
    `OAuth service listening on http://localhost:${PORT}`
  );
});