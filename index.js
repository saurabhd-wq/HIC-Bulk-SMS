require("dotenv").config();

const express = require("express");
const axios = require("axios");

const env = require("./config/env");
const hubspotService = require("./services/hubspotService");

const installationRepository = require("./repositories/installationRepository");
const smsCampaignRepository = require("./repositories/smsCampaignRepository");
const contactRepository = require("./repositories/contactRepository");
const conversationSendRoute = require("./routes/conversationSendRoute");
const twilioSetupRoute = require("./routes/twilioSetupRoute");

const smsSendService = require("./services/smsSendService");
const schedulerService = require("./services/schedulerService");

const mergeFieldRoutes = require("./routes/mergeFieldRoutes");

const {
  saveOutgoingMessage,
} = require("./repositories/conversationRepository");

const conversationRoutes = require("./routes/conversationRoutes");

const twilioService = require("./services/twilioService");

const app = express();

app.use(express.json());
app.use("/api/conversations/send", conversationSendRoute);
app.use("/api/twilio/setup", twilioSetupRoute);
app.use("/api/merge-fields", mergeFieldRoutes);

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
/* CAMPAIGN HISTORY */

app.get("/campaigns/history", async (req, res) => {
  try {
    const hubId = Number(req.query.hubId);
    const status = req.query.status;

    if (!hubId) {
      return res.status(400).json({
        success: false,
        message: "hubId is required.",
      });
    }

    const allowedStatuses = ["SCHEDULED", "SENT", "FAILED"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be one of: SCHEDULED, SENT, FAILED.",
      });
    }

    const campaigns = await smsCampaignRepository.getCampaignsByStatus(
      hubId,
      status
    );

    res.json(campaigns);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
schedulerService.start();
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

    const campaign = await smsCampaignRepository.getCampaign(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    const result = await smsSendService.sendCampaignMessage(campaign, message);

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* SCHEDULE SMS */

app.post("/campaigns/:id/schedule", async (req, res) => {
  try {
    const { message, scheduledAt, timezone } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    if (!scheduledAt) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt is required.",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt must be a valid date/time.",
      });
    }

    if (scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt must be in the future.",
      });
    }

    const campaign = await smsCampaignRepository.getCampaign(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    const updated = await smsCampaignRepository.scheduleCampaign(
      req.params.id,
      message,
      scheduledDate.toISOString(),
      timezone || "UTC"
    );

    res.json(updated);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
app.put("/campaigns/:id", async (req, res) => {
  try {
    const { message, scheduledAt, timezone } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    if (!scheduledAt) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt is required.",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt must be a valid date/time.",
      });
    }

    const campaign = await smsCampaignRepository.getCampaign(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    if (campaign.status !== "SCHEDULED") {
      return res.status(400).json({
        success: false,
        message: "Only scheduled campaigns can be edited.",
      });
    }

    const updated = await smsCampaignRepository.updateScheduledCampaign(
      req.params.id,
      message,
      scheduledDate.toISOString(),
      timezone || "UTC"
    );

    res.json(updated);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* DELETE SCHEDULED CAMPAIGN */

app.delete("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await smsCampaignRepository.getCampaign(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found.",
      });
    }

    if (campaign.status !== "SCHEDULED") {
      return res.status(400).json({
        success: false,
        message: "Only scheduled campaigns can be deleted.",
      });
    }

    const deleted = await smsCampaignRepository.deleteScheduledCampaign(
      req.params.id
    );

    res.json({
      success: true,
      deleted,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/debug/object-types", async (req, res) => {
  const axios = require("axios");
  const hubId = Number(req.query.hubId);
 
  if (!hubId) return res.status(400).json({ message: "hubId required" });
 
  try {
    const installation = await installationRepository.getInstallation(hubId);
    if (!installation) return res.status(404).json({ message: "Installation not found" });
 
    const response = await axios.get(
      "https://api.hubapi.com/crm/v3/schemas",
      { headers: { Authorization: `Bearer ${installation.access_token}` } }
    );
 
    const types = response.data.results.map((s) => ({
      name: s.name,           // this is what you put in HS_CAMPAIGN_OBJECT_TYPE
      label: s.labels?.singular,
      fullyQualifiedName: s.fullyQualifiedName,
    }));
 
    res.json(types);
  } catch (err) {
    res.status(500).json({ message: err.message, detail: err.response?.data });
  }
});

app.listen(env.PORT, () => {
  console.log(
    `OAuth service listening on port ${env.PORT}`
  );
});