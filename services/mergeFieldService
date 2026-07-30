const hubspotPropertiesService = require("./hubspotPropertiesService");
const hubspotAssociationsService = require("./hubspotAssociationsService");

const MERGE_TOKEN_REGEX = /{{\s*(contact|company|deal|ticket)\.([a-zA-Z0-9_]+)\s*}}/g;



function extractTokens(message) {
  const tokens = [];
  let match;

  MERGE_TOKEN_REGEX.lastIndex = 0;

  while ((match = MERGE_TOKEN_REGEX.exec(message)) !== null) {
    tokens.push({ object: match[1], property: match[2], raw: match[0] });
  }

  return tokens;
}

function groupPropertiesByObject(tokens) {
  const grouped = { contact: new Set(), company: new Set(), deal: new Set(), ticket: new Set() };
  tokens.forEach(({ object, property }) => grouped[object].add(property));
  return grouped;
}

/**
 * Replaces every {{object.property}} token in `message` with the real value
 * for `contact`. Anything that can't be resolved (missing association,
 * missing value, unknown property) becomes an empty string — a merge token
 * is never sent unresolved.
 */
async function resolveMessageForContact(hubId, message, contact) {
  const tokens = extractTokens(message);

  if (tokens.length === 0) {
    return message;
  }

  const needed = groupPropertiesByObject(tokens);

  const associatedIds =
    needed.company.size || needed.deal.size || needed.ticket.size
      ? await hubspotAssociationsService.getAssociatedIdsForContact(hubId, contact.id)
      : { company: null, deal: null, ticket: null };

  const [contactValues, companyValues, dealValues, ticketValues] = await Promise.all([
    needed.contact.size
      ? hubspotPropertiesService.getObjectValues(hubId, "contact", contact.id, [...needed.contact])
      : {},
    needed.company.size
      ? hubspotPropertiesService.getObjectValues(hubId, "company", associatedIds.company, [...needed.company])
      : {},
    needed.deal.size
      ? hubspotPropertiesService.getObjectValues(hubId, "deal", associatedIds.deal, [...needed.deal])
      : {},
    needed.ticket.size
      ? hubspotPropertiesService.getObjectValues(hubId, "ticket", associatedIds.ticket, [...needed.ticket])
      : {},
  ]);

  const valuesByObject = {
    contact: contactValues,
    company: companyValues,
    deal: dealValues,
    ticket: ticketValues,
  };

  let resolved = message;

  tokens.forEach(({ object, property, raw }) => {
    const value = valuesByObject[object]?.[property];
    resolved = resolved.split(raw).join(value ?? "");
  });

  return resolved;
}

module.exports = {
  extractTokens,
  resolveMessageForContact,
};