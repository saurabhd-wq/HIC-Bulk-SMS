require("dotenv").config();

const express = require("express");
const axios = require("axios");

const env = require("./config/env");
const hubspotService = require("./services/hubspotService");

const installationRepository = require("./repositories/installationRepository");
const smsCampaignRepository = require("./repositories/smsCampaignRepository");
const contactRepository = require("./repositories/contactRepository");
const conversationSendRoute = require("./routes/conversationSendRoute");

const conversationRoutes = require("./routes/conversationRoutes");

const twilioService = require("./services/twilioService");

const app = express();

app.use(express.json());
app.use("/api/conversations/send", conversationSendRoute);

app.get("/", (req, res) => {
  res.send("HubSpot OAuth Service is running.");
});

/* OAuth */

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

    const tokenData = response.data;

    await installationRepository.saveInstallation({
      hubId: tokenData.hub_id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(
        Date.now() + tokenData.expires_in * 1000
      ),
    });

    res.send("Installation successful.");
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("OAuth failed.");
  }
});

app.use("/api/conversations", conversationRoutes);

app.get("/contacts", async (req, res) => {
  try {
    const hubId = Number(req.query.hubId);

    if (!hubId) {
      return res.status(400).json({
        success: false,
        message: "hubId is required.",
      });
    }

    const contacts = await hubspotService.getContacts(hubId, req.query.search || "");

    res.json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.post("/campaigns", async (req, res) => {
  try {
    const { hubId, contactIds } = req.body;

    if (!hubId) {
      return res.status(400).json({
        success: false,
        message: "hubId is required.",
      });
    }

    const campaign = await smsCampaignRepository.createCampaign(hubId, contactIds);

    res.json(campaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
app.get("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await smsCampaignRepository.getCampaign(
      req.params.id
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    res.json(campaign);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/campaigns/:id/contacts", async (req, res) => {
  try {
    const campaign = await smsCampaignRepository.getCampaign(
      req.params.id
    );
    console.log("Campaign:", campaign);
console.log("Campaign hub_id:", campaign.hub_id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    const contacts =
  await contactRepository.getContactsByIds(
    campaign.hub_id,
    campaign.contact_ids
  );

    res.json(contacts);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* SEND SMS */

app.post("/campaigns/:id/send", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    const campaign =
      await smsCampaignRepository.getCampaign(
        req.params.id
      );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    const contacts =
  await contactRepository.getContactsByIds(
    campaign.hub_id,
    campaign.contact_ids
  );

    let success = 0;
    let failed = 0;

    const results = [];

    for (const contact of contacts) {
      const phone =
        contact.phone || contact.mobilePhone;

      if (!phone) {
        failed++;

        results.push({
          contact: contact.email,
          status: "No Phone",
        });

        continue;
      }

      try {
        const sms =
          await twilioService.sendSMS(
            phone,
            message
          );

        success++;
 
        results.push({
          contact: contact.email,
          status: "Sent",
          sid: sms.sid,
        });
      } catch (err) {
        failed++;

        results.push({
          contact: contact.email,
          status: err.message,
        });
      }
    }

    res.json({
      total: contacts.length,
      success,
      failed,
      results,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.listen(env.PORT, () => {
  console.log(
    `OAuth service listening on port ${env.PORT}`
  );
});