require("dotenv").config();

const express = require("express");
const axios = require("axios");

const env = require("./config/env");
const tokenStore = require("./storage/tokenStore");
const hubspotService = require("./services/hubspotService");

const app = express();

app.use(express.json());

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
        client_id: env.HUBSPOT_CLIENT_ID,
        client_secret: env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: env.HUBSPOT_REDIRECT_URI,
        code,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    tokenStore.saveTokens(response.data);

    console.log("HubSpot OAuth tokens saved.");

    res.send(`
      <h2>HubSpot App Installed Successfully</h2>
      <p>You can close this window.</p>
    `);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("OAuth token exchange failed.");
  }
});

app.get("/contacts", async (req, res) => {
  try {
    const contacts = await hubspotService.getContacts();
    res.json(contacts);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.listen(env.PORT, () => {
  console.log(`OAuth service listening on port ${env.PORT}`);
});