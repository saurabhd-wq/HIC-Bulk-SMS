const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");
const oauthService = require("./oauthService");

const ASSOCIATION_TARGET_MAP = {
  company: "companies",
  deal: "deals",
  ticket: "tickets",
};

async function withTokenRetry(hubId, fn) {
  const installation = await installationRepository.getInstallation(hubId);

  if (!installation) {
    throw new Error("HubSpot installation not found.");
  }

  try {
    return await fn(installation.access_token);
  } catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }

    const newAccessToken = await oauthService.refreshAccessToken(hubId);
    return await fn(newAccessToken);
  }
}

function pickPrimaryOrFirst(results) {
  if (!results || results.length === 0) return null;

  const primary = results.find((result) =>
    (result.associationTypes || []).some((type) =>
      (type.label || "").toLowerCase().includes("primary")
    )
  );

  return (primary || results[0]).toObjectId;
}

/**
 * Returns associated company/deal/ticket ids for a contact — "Primary
 * association if present, otherwise first", exactly as specced.
 */
async function getAssociatedIdsForContact(hubId, contactId) {
  const targets = Object.entries(ASSOCIATION_TARGET_MAP);

  const lookups = await Promise.all(
    targets.map(([mergeObjectType, hubspotObjectType]) =>
      withTokenRetry(hubId, (accessToken) =>
        axios
          .get(
            `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/${hubspotObjectType}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          .then((response) => [
            mergeObjectType,
            pickPrimaryOrFirst(response.data.results),
          ])
          .catch((error) => {
            // No association / object type not enabled on this portal —
            // treat as "no related record", don't fail the whole send.
            if (error.response?.status === 404) return [mergeObjectType, null];
            throw error;
          })
      )
    )
  );

  return Object.fromEntries(lookups);
}

module.exports = {
  getAssociatedIdsForContact,
};
