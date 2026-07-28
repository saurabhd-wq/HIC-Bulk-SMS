const contactRepository = require("../repositories/contactRepository");
const twilioService = require("./twilioService");
const { saveOutgoingMessage } = require("../repositories/conversationRepository");

async function sendCampaignMessage(campaign, message) {
  const contacts = await contactRepository.getContactsByIds(
    campaign.hub_id,
    campaign.contact_ids
  );

  let success = 0;
  let failed = 0;

  const results = [];

  for (const contact of contacts) {
    const phone = contact.phone || contact.mobilePhone;

    if (!phone) {
      failed++;

      results.push({
        contact: contact.email,
        status: "No Phone",
      });

      continue;
    }

    try {
      const sms = await twilioService.sendSMS(campaign.hub_id, phone, message);

      await saveOutgoingMessage({
        contactId: contact.id,
        phoneNumber: phone,
        twilioMessageSid: sms.sid,
        message: message.trim(),
        status: sms.status,
      });
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

  return {
    total: contacts.length,
    success,
    failed,
    results,
  };
}

module.exports = {
  sendCampaignMessage,
};