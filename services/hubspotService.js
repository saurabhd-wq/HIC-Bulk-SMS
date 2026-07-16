const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");
const oauthService = require("./oauthService");

async function fetchContacts(accessToken) {
  const response = await axios.get(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

async function getContacts(hubId, search = "") {
  const installation = await installationRepository.getInstallation(hubId);

  if (!installation) {
    throw new Error("HubSpot installation not found.");
  }

  let contacts;

  try {
    contacts = await fetchContacts(installation.access_token);
  } catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }

    const newAccessToken = await oauthService.refreshAccessToken(hubId);
    contacts = await fetchContacts(newAccessToken);
  }

  if (!search || search.trim() === "") {
    return contacts;
  }

  const searchText = search.toLowerCase().trim();

  return contacts.filter((contact) => {
    return (
      contact.firstName.toLowerCase().includes(searchText) ||
      contact.lastName.toLowerCase().includes(searchText) ||
      contact.email.toLowerCase().includes(searchText) ||
      contact.phone.toLowerCase().includes(searchText) ||
      contact.mobilePhone.toLowerCase().includes(searchText)
    );
  });
}

module.exports = {
  getContacts,
};