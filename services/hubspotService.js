const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");

async function getContacts(search = "") {
  // TODO: Later we'll make this dynamic from the HubSpot request context
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

  const contacts = response.data.results.map((contact) => ({
    id: contact.id,
    firstName: contact.properties.firstname || "",
    lastName: contact.properties.lastname || "",
    email: contact.properties.email || "",
    phone: contact.properties.phone || "",
    mobilePhone: contact.properties.mobilephone || "",
  }));

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