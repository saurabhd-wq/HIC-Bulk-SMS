const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");
const oauthService = require("./oauthService");

async function fetchContacts(accessToken) {
  const [contactsResponse, ownerMap] = await Promise.all([
    axios.get("https://api.hubapi.com/crm/v3/objects/contacts", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 100,
        properties: "firstname,lastname,email,phone,mobilephone,company,hubspot_owner_id",
      },
    }),
    fetchOwners(accessToken),
  ]);

  return contactsResponse.data.results.map((contact) => ({
    id: contact.id,
    firstName: contact.properties.firstname || "",
    lastName: contact.properties.lastname || "",
    email: contact.properties.email || "",
    phone: contact.properties.phone || "",
    mobilePhone: contact.properties.mobilephone || "",
    company: contact.properties.company || "",
    contactOwner: ownerMap[contact.properties.hubspot_owner_id] || "",
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
async function fetchOwners(accessToken) {
  const response = await axios.get(
    "https://api.hubapi.com/crm/v3/owners",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 100,
      },
    }
  );

  const ownerMap = {};
  response.data.results.forEach((owner) => {
    ownerMap[owner.id] = `${owner.firstName || ""} ${owner.lastName || ""}`.trim();
  });

  return ownerMap;
}

module.exports = {
  getContacts,
};