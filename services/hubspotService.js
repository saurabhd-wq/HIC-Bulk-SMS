const axios = require("axios");
const tokenStore = require("../storage/tokenStore");

async function getContacts() {
  const tokens = tokenStore.getTokens();

  if (!tokens || !tokens.access_token) {
    throw new Error("HubSpot access token not found.");
  }

  const response = await axios.get(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
      params: {
        limit: 100,
        properties: "firstname,lastname,email,phone,mobilephone",
      },
    }
  );

  return response.data;
}

module.exports = {
  getContacts,
};