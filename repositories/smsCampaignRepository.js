/**
 * smsCampaignRepository.js
 *
 * Storage implementation for SMS Campaigns.
 * Replaced PostgreSQL (sms_campaigns table) with HubSpot CRM Custom Objects.
 *
 * METHOD SIGNATURES AND RETURN SHAPES ARE IDENTICAL TO THE PREVIOUS
 * POSTGRESQL IMPLEMENTATION. No changes to callers are required.
 *
 * HubSpot Custom Object: "SMS Campaign"
 * Properties used:
 *   hub_id          – string  (portal/hub identifier)
 *   contact_ids     – string  (JSON-serialised array, e.g. '["1","2"]')
 *   message         – string
 *   status          – string  DRAFT | SCHEDULED | SENT | FAILED
 *   scheduled_at    – string  (ISO-8601 datetime or empty)
 *   timezone        – string
 */

const axios = require("axios");
const installationRepository = require("./installationRepository");
const oauthService = require("../services/oauthService");

// ─── HubSpot object type identifier for the custom object ─────────────────────
// HubSpot assigns a fully-qualified name like "p12345_sms_campaign".
// We read it from env so you can set it once after the object is created
// in your portal(s) without touching code.
const OBJECT_TYPE = process.env.HS_CAMPAIGN_OBJECT_TYPE || "sms_campaign";

// ─── Token-retry helper ────────────────────────────────────────────────────────

async function withTokenRetry(hubId, fn) {
  const installation = await installationRepository.getInstallation(hubId);

  if (!installation) {
    throw new Error(`HubSpot installation not found for hubId ${hubId}.`);
  }

  try {
    return await fn(installation.access_token);
  } catch (error) {
    if (error.response?.status !== 401) throw error;

    const newAccessToken = await oauthService.refreshAccessToken(hubId);
    return await fn(newAccessToken);
  }
}

// ─── Shape normaliser ─────────────────────────────────────────────────────────
// Converts a raw HubSpot CRM object into the flat row shape that the rest of
// the application expects (matching the old PostgreSQL column names exactly).

function toRow(hsObject) {
  if (!hsObject) return null;

  const p = hsObject.properties || {};

  // contact_ids is stored as a JSON string; parse it back to an array.
  let contact_ids = [];
  try {
    contact_ids = p.contact_ids ? JSON.parse(p.contact_ids) : [];
  } catch {
    contact_ids = [];
  }

  return {
    // HubSpot object id is a string – kept as-is so callers can pass it back.
    id: hsObject.id,

    // Stored as a string property; cast to number to match old BIGINT behaviour.
    hub_id: p.hub_id ? Number(p.hub_id) : null,

    contact_ids,

    message: p.message || null,
    status: p.status || "DRAFT",
    scheduled_at: p.scheduled_at || null,
    timezone: p.timezone || null,

    // HubSpot always gives us these metadata timestamps.
    created_at: hsObject.createdAt || null,
    updated_at: hsObject.updatedAt || null,
  };
}

// ─── Low-level API helpers ────────────────────────────────────────────────────

function hsBase(accessToken) {
  return axios.create({
    baseURL: `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPE}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

const ALL_PROPERTIES = [
  "hub_id",
  "contact_ids",
  "message",
  "status",
  "scheduled_at",
  "timezone",
];

// POST /crm/v3/objects/<type>
async function hsCreate(accessToken, properties) {
  const client = hsBase(accessToken);
  const response = await client.post("", { properties });
  return response.data;
}

// GET /crm/v3/objects/<type>/:id
async function hsFetch(accessToken, id) {
  const client = hsBase(accessToken);
  const response = await client.get(`/${id}`, {
    params: { properties: ALL_PROPERTIES.join(",") },
  });
  return response.data;
}

// PATCH /crm/v3/objects/<type>/:id
async function hsPatch(accessToken, id, properties) {
  const client = hsBase(accessToken);
  const response = await client.patch(`/${id}`, { properties });
  return response.data;
}

// DELETE /crm/v3/objects/<type>/:id
async function hsDelete(accessToken, id) {
  const client = hsBase(accessToken);
  await client.delete(`/${id}`);
}

// POST /crm/v3/objects/<type>/search
async function hsSearch(accessToken, filterGroups, sorts = [], limit = 100) {
  const client = hsBase(accessToken);
  const response = await client.post("/search", {
    filterGroups,
    sorts,
    properties: ALL_PROPERTIES,
    limit,
  });
  return response.data.results || [];
}

// ─── Exported repository methods ──────────────────────────────────────────────

/**
 * Create a new campaign in DRAFT status.
 * Matches: createCampaign(hubId, contactIds) → row
 */
async function createCampaign(hubId, contactIds) {
  const hsObject = await withTokenRetry(hubId, (token) =>
    hsCreate(token, {
      hub_id: String(hubId),
      contact_ids: JSON.stringify(contactIds),
      status: "DRAFT",
    })
  );

  // hsFetch to get all properties back (create only returns id + timestamps).
  const full = await withTokenRetry(hubId, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Fetch a single campaign by its HubSpot object id.
 * Matches: getCampaign(id) → row | null
 *
 * NOTE: Because this is called without hubId we resolve the hubId from the
 * object's own hub_id property after a cross-portal search, or we accept the
 * id format "hubId:objectId" internally. To keep caller code unchanged we
 * implement a two-step approach:
 *   1. Try each known installation until one returns the object.
 *   2. Return null if none find it.
 */
async function getCampaign(id) {
  const installations = await installationRepository.getAllInstallations();

  for (const installation of installations) {
    try {
      const hsObject = await withTokenRetry(
        installation.hub_id,
        (token) => hsFetch(token, id)
      );

      if (hsObject) return toRow(hsObject);
    } catch (error) {
      // 404 means this portal doesn't own the object – try next.
      if (error.response?.status === 404) continue;
      throw error;
    }
  }

  return null;
}

/**
 * Update only the message field.
 * Matches: updateMessage(id, message) → row
 */
async function updateMessage(id, message) {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found.`);

  const hsObject = await withTokenRetry(campaign.hub_id, (token) =>
    hsPatch(token, id, { message })
  );

  const full = await withTokenRetry(campaign.hub_id, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Set message, scheduledAt, timezone and flip status to SCHEDULED.
 * Matches: scheduleCampaign(id, message, scheduledAt, timezone) → row
 */
async function scheduleCampaign(id, message, scheduledAt, timezone) {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found.`);

  const hsObject = await withTokenRetry(campaign.hub_id, (token) =>
    hsPatch(token, id, {
      message,
      scheduled_at: scheduledAt,
      timezone,
      status: "SCHEDULED",
    })
  );

  const full = await withTokenRetry(campaign.hub_id, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Returns all SCHEDULED campaigns whose scheduled_at is <= now, across every
 * installed portal.
 * Matches: getDueScheduledCampaigns() → row[]
 */
async function getDueScheduledCampaigns() {
  const installations = await installationRepository.getAllInstallations();
  const now = new Date().toISOString();
  const results = [];

  for (const installation of installations) {
    try {
      const hsObjects = await withTokenRetry(
        installation.hub_id,
        (token) =>
          hsSearch(
            token,
            [
              {
                filters: [
                  { propertyName: "status", operator: "EQ", value: "SCHEDULED" },
                  { propertyName: "scheduled_at", operator: "LTE", value: now },
                ],
              },
            ],
            [{ propertyName: "scheduled_at", direction: "ASCENDING" }]
          )
      );

      for (const obj of hsObjects) {
        results.push(toRow(obj));
      }
    } catch (error) {
      // Log but don't stop processing other portals.
      console.error(
        `smsCampaignRepository: failed to fetch due campaigns for hub ${installation.hub_id}`,
        error.message
      );
    }
  }

  return results;
}

/**
 * Mark a campaign as SENT.
 * Matches: markCampaignSent(id) → row
 */
async function markCampaignSent(id) {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found.`);

  const hsObject = await withTokenRetry(campaign.hub_id, (token) =>
    hsPatch(token, id, { status: "SENT" })
  );

  const full = await withTokenRetry(campaign.hub_id, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Mark a campaign as FAILED.
 * Matches: markCampaignFailed(id) → row
 */
async function markCampaignFailed(id) {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found.`);

  const hsObject = await withTokenRetry(campaign.hub_id, (token) =>
    hsPatch(token, id, { status: "FAILED" })
  );

  const full = await withTokenRetry(campaign.hub_id, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Returns all campaigns for a portal filtered by status.
 * Sorted: SCHEDULED → by scheduled_at DESC, others → by updatedAt DESC.
 * Matches: getCampaignsByStatus(hubId, status) → row[]
 */
async function getCampaignsByStatus(hubId, status) {
  const sortProperty =
    status === "SCHEDULED" ? "scheduled_at" : "hs_lastmodifieddate";

  const hsObjects = await withTokenRetry(hubId, (token) =>
    hsSearch(
      token,
      [
        {
          filters: [
            { propertyName: "hub_id", operator: "EQ", value: String(hubId) },
            { propertyName: "status", operator: "EQ", value: status },
          ],
        },
      ],
      [{ propertyName: sortProperty, direction: "DESCENDING" }]
    )
  );

  return hsObjects.map(toRow);
}

/**
 * Update message, scheduledAt and timezone on an already-SCHEDULED campaign.
 * Returns null if the campaign is not found or is not in SCHEDULED status.
 * Matches: updateScheduledCampaign(id, message, scheduledAt, timezone) → row | null
 */
async function updateScheduledCampaign(id, message, scheduledAt, timezone) {
  const campaign = await getCampaign(id);

  if (!campaign || campaign.status !== "SCHEDULED") return null;

  const hsObject = await withTokenRetry(campaign.hub_id, (token) =>
    hsPatch(token, id, {
      message,
      scheduled_at: scheduledAt,
      timezone,
    })
  );

  const full = await withTokenRetry(campaign.hub_id, (token) =>
    hsFetch(token, hsObject.id)
  );

  return toRow(full);
}

/**
 * Hard-delete a SCHEDULED campaign.
 * Returns the deleted row snapshot or null if not found / not SCHEDULED.
 * Matches: deleteScheduledCampaign(id) → row | null
 */
async function deleteScheduledCampaign(id) {
  const campaign = await getCampaign(id);

  if (!campaign || campaign.status !== "SCHEDULED") return null;

  // Capture the snapshot before deletion (matches old RETURNING * behaviour).
  const snapshot = { ...campaign };

  await withTokenRetry(campaign.hub_id, (token) => hsDelete(token, id));

  return snapshot;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createCampaign,
  getCampaign,
  updateMessage,
  scheduleCampaign,
  getDueScheduledCampaigns,
  markCampaignSent,
  markCampaignFailed,
  getCampaignsByStatus,
  updateScheduledCampaign,
  deleteScheduledCampaign,
};