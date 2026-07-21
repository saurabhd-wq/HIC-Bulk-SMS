const twilio = require("twilio");
const { getCredentialsByHubId } = require("../repositories/twilioRepository");

async function sendSMS(hubId, to, body) {
  const credentials = await getCredentialsByHubId(hubId);

  if (!credentials) {
    throw new Error("Twilio configuration not found for this HubSpot account.");
  }

  const client = twilio(
    credentials.account_sid,
    credentials.auth_token
  );

  return await client.messages.create({
    from: credentials.from_number,
    to,
    body,
  });
}

module.exports = {
  sendSMS,
};