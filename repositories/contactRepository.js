const hubspotService = require("../services/hubspotService");

async function getContactsByIds(hubId, contactIds) {
  const contacts = await hubspotService.getContacts(hubId);

  return contacts.filter((contact) =>
    contactIds.includes(contact.id)
  );
}

module.exports = {
  getContactsByIds,
};