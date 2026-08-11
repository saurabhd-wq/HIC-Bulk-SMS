const axios = require("axios");
const env = require("../config/env");
const installationRepository = require("../repositories/installationRepository");

async function refreshAccessToken(hubId) {
  const installation = await installationRepository.getInstallation(hubId);

  if (!installation) {
    throw new Error("HubSpot installation not found.");
  }

  const response = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.HUBSPOT_CLIENT_ID,
      client_secret: env.HUBSPOT_CLIENT_SECRET,
      refresh_token: installation.refresh_token,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const tokenData = response.data;

  const expiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000
  );

  await installationRepository.saveInstallation({
    hubId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || installation.refresh_token,
    expiresAt,
  });

  return tokenData.access_token;
}

module.exports = {
  refreshAccessToken,
};