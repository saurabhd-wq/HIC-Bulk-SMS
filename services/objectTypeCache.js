// services/objectTypeCache.js

const oauthService = require("./oauthService");

const HS_API_BASE = "https://api.hubapi.com";

// Per-hub cache: { "246724823": { sms_campaign: "2-267666792", sms_conversation: "2-267666795" } }
const cache = {};

async function fetchAndBuildCache(hubId) {
  const token = await oauthService.getValidAccessToken(hubId);

  const res = await fetch(`${HS_API_BASE}/crm-object-schemas/v3/schemas`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[objectTypeCache] Schema fetch failed for hub ${hubId}: ${res.status} ${text}`
    );
  }

  const { results = [] } = await res.json();
  const map = {};

  for (const schema of results) {
    // HubSpot always stores name as "p_sms_campaign" — strip p_ for lookup key
    const raw = schema.name ?? "";
    const key = raw.startsWith("p_") ? raw.slice(2) : raw;

    if (key === "sms_campaign" || key === "sms_conversation") {
      map[key] = schema.objectTypeId; // e.g. "2-267666792"
    }
  }

  console.log(`[objectTypeCache] hub ${hubId} resolved:`, map);
  return map;
}

async function getObjectTypeId(hubId, objectName) {
  const key = String(hubId);

  if (!cache[key]) {
    cache[key] = await fetchAndBuildCache(hubId);
  }

  const typeId = cache[key][objectName];

  if (!typeId) {
    throw new Error(
      `[objectTypeCache] "${objectName}" not found in hub ${key}. ` +
      `Found: ${JSON.stringify(cache[key])}. ` +
      `Run the Setup to create Custom Objects first.`
    );
  }

  return typeId;
}

function clearCache(hubId) {
  delete cache[String(hubId)];
}

module.exports = { getObjectTypeId, clearCache };