const express = require("express");
const router = express.Router();

const {
  getContactByPhone,
} = require("../services/hubspotService");
const installationRepository = require("../repositories/installationRepository");

const {
  saveIncomingMessage,
} = require("../repositories/conversationRepository");

router.post("/", async (req, res) => {
  try {
    const {
      From,
      To,
      Body,
      MessageSid,
      SmsStatus,
    } = req.body;

const installations =
  await installationRepository.getAllInstallations();

let matchedHubId = null;
let contact = null;

for (const installation of installations) {
  contact = await getContactByPhone(
    installation.hub_id,
    From
  );

  if (contact) {
    matchedHubId = installation.hub_id;
    break;
  }
}

if (!contact) {
  console.log("No HubSpot contact found for:", From);
  return res.sendStatus(200);
}

    if (!contact) {
      console.log("No HubSpot contact found for:", From);
      return res.sendStatus(200);
    }

await saveIncomingMessage({
  contactId: contact.id,
  phoneNumber: From,
  twilioMessageSid: MessageSid,
  message: Body,
  status: SmsStatus || "received",
});

console.log(
  `Incoming SMS saved for Hub ${matchedHubId}, Contact ${contact.id}`
);

    console.log(
      `Incoming SMS saved for contact ${contact.id}`
    );

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

module.exports = router;