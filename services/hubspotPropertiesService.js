const axios = require("axios");
const installationRepository = require("../repositories/installationRepository");
const oauthService = require("./oauthService");

// objectType keys used throughout the merge-field feature -> HubSpot API object type
const OBJECT_TYPE_MAP = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
  ticket: "tickets",
};

const PROPERTIES_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const propertiesCache = new Map();

function getCacheKey(hubId, mergeObjectType) {
  return `${hubId}:${mergeObjectType}`;
}

async function fetchPropertiesFromHubspot(accessToken, hubspotObjectType) {
  const response = await axios.get(
    `https://api.hubapi.com/crm/v3/properties/${hubspotObjectType}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.data.results
    .filter((prop) => !prop.hidden && !prop.calculated)
    .map((prop) => ({
      name: prop.name,
      label: prop.label || prop.name,
      isCustom: prop.hubspotDefined === false,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

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

/**
 * Returns the list of insertable properties for one merge-field object
 * (contact | company | deal | ticket), using the cache when available.
 */
async function getProperties(hubId, mergeObjectType) {
  const hubspotObjectType = OBJECT_TYPE_MAP[mergeObjectType];

  if (!hubspotObjectType) {
    throw new Error(`Unsupported merge field object: ${mergeObjectType}`);
  }

  const cacheKey = getCacheKey(hubId, mergeObjectType);
  const cached = propertiesCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < PROPERTIES_CACHE_TTL_MS) {
    return cached.properties;
  }

  const properties = await withTokenRetry(hubId, (accessToken) =>
    fetchPropertiesFromHubspot(accessToken, hubspotObjectType)
  );

  propertiesCache.set(cacheKey, {
    properties,
    fetchedAt: Date.now(),
  });

  return properties;
}

/**
 * Returns all four sections at once (used for the popup's first paint).
 */
async function getAllProperties(hubId) {
  const [contact, company, deal, ticket] = await Promise.all([
    getProperties(hubId, "contact"),
    getProperties(hubId, "company"),
    getProperties(hubId, "deal"),
    getProperties(hubId, "ticket"),
  ]);

  return { contact, company, deal, ticket };
}

/**
 * Fetches a single object's property values by id, only for the property
 * names actually requested (keeps merge-resolution requests small).
 */
async function getObjectValues(hubId, mergeObjectType, objectId, propertyNames) {
  const hubspotObjectType = OBJECT_TYPE_MAP[mergeObjectType];

  if (!hubspotObjectType || !objectId || propertyNames.length === 0) {
    return {};
  }

  const fetchRecord = (accessToken) =>
    axios.get(
      `https://api.hubapi.com/crm/v3/objects/${hubspotObjectType}/${objectId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { properties: propertyNames.join(",") },
      }
    );

  const response = await withTokenRetry(hubId, fetchRecord);

  return response.data.properties || {};
}


module.exports = {
  OBJECT_TYPE_MAP,
  getProperties,
  getAllProperties,
  getObjectValues,
};
