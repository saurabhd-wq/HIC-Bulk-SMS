const twilio = require("twilio");
const { getCredentialsByHubId } = require("../repositories/twilioRepository");

async function sendSMS(hubId, to, body) {
  const credentials = await getCredentialsByHubId(hubId);

  if (!credentials) {
    throw new Error(
    "Twilio is not set up for this HubSpot account. Click 'Setup Twilio' and configure your Twilio credentials before sending SMS."
    );
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