const hubspotService = require("../services/hubspotService");

async function getContactsByIds(contactIds) {
  const contacts = await hubspotService.getContacts();

  return contacts.filter(contact => contactIds.includes(contact.id));
}

module.exports = {
  getContactsByIds,
};