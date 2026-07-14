const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");

async function getContacts() {
  // Replace this with your Developer Test Account Hub ID for now.
  // We'll make this dynamic in the next phase.
  const HUB_ID = 246694241;

  const installation = await installationRepository.getInstallation(HUB_ID);

  if (!installation) {
    throw new Error("HubSpot installation not found.");
  }

  const response = await axios.get(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    {
      headers: {
        Authorization: `Bearer ${installation.access_token}`,
      },
      params: {
        limit: 100,
        properties: "firstname,lastname,email,phone,mobilephone",
      },
    }
  );

  return response.data.results.map((contact) => ({
    id: contact.id,
    firstName: contact.properties.firstname || "",
    lastName: contact.properties.lastname || "",
    email: contact.properties.email || "",
    phone: contact.properties.phone || "",
    mobilePhone: contact.properties.mobilephone || "",
  }));
}

module.exports = {
  getContacts,
};