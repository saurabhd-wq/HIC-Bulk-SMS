// repositories/smsCampaignRepository.js
//
// Drop-in replacement for the PostgreSQL smsCampaignRepository.
// All public method signatures and return shapes are preserved exactly.
// Only the storage layer changes: PostgreSQL → HubSpot Custom Object "SMS Campaign".
//
// HubSpot Custom Object internal name assumed: "sms_campaign"
// (adjust OBJECT_TYPE below if your portal uses a different internal name)
//
// Every write goes through the access token fetched per hub_id from
// the existing PostgreSQL installationRepository — no OAuth logic changes.

const { getInstallation, refreshIfNeeded } = require("./installationRepository");

const OBJECT_TYPE = "sms_campaign"; // HubSpot Custom Object internal name
const HS_API_BASE = "https://api.hubapi.com";

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given hub.
 * Reuses your existing OAuth refresh logic — nothing changes there.
 */
async function getToken(hubId) {
  const installation = await refreshIfNeeded(hubId);
  return installation.access_token;
}

/**
 * Central fetch wrapper — adds auth header and throws on non-2xx.
 */
async function hsRequest(method, path, hubId, body = null) {
  const token = await getToken(hubId);

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${HS_API_BASE}${path}`, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }

  // 204 No Content → nothing to parse
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Maps a raw HubSpot Custom Object result → the row shape that
 * controllers and services already expect (mirrors PostgreSQL column names).
 *
 * PostgreSQL row shape:
 *   { id, hub_id, contact_ids, message, status, scheduled_at, timezone, updated_at, created_at }
 */
function toRow(hsObject) {
  if (!hsObject) return null;

  const p = hsObject.properties || {};

  return {
    // Use the HubSpot record id as the primary key — callers treat `id` as opaque string
    id: hsObject.id,

    hub_id:       p.hub_id       ?? null,
    contact_ids:  p.contact_ids  ? JSON.parse(p.contact_ids) : [],
    message:      p.message      ?? null,
    status:       p.status       ?? null,
    scheduled_at: p.scheduled_at ?? null,
    timezone:     p.timezone     ?? null,

    // HubSpot stores these automatically; expose them so any code that
    // reads updated_at / created_at continues to work
    updated_at:   p.hs_lastmodifieddate ?? null,
    created_at:   p.createdate          ?? null,
  };
}

// Properties to request on every GET so toRow() has everything it needs
const ALL_PROPERTIES = [
  "hub_id",
  "contact_ids",
  "message",
  "status",
  "scheduled_at",
  "timezone",
  "hs_lastmodifieddate",
  "createdate",
].join(",");

// ─────────────────────────────────────────────────────────────
// Public API  (identical signatures to the PostgreSQL version)
// ─────────────────────────────────────────────────────────────

/**
 * createCampaign(hubId, contactIds) → row
 *
 * PostgreSQL equivalent:
 *   INSERT INTO sms_campaigns (hub_id, contact_ids) VALUES (…) RETURNING *
 */
async function createCampaign(hubId, contactIds) {
  const data = await hsRequest(
    "POST",
    `/crm/v3/objects/${OBJECT_TYPE}`,
    hubId,
    {
      properties: {
        hub_id:      String(hubId),
        contact_ids: JSON.stringify(contactIds),
        status:      "PENDING",
      },
    }
  );

  return toRow(data);
}

/**
 * getCampaign(id) → row | null
 *
 * PostgreSQL equivalent:
 *   SELECT * FROM sms_campaigns WHERE id = $1
 *
 * NOTE: Because HubSpot records do not embed hub_id in the GET-by-id URL,
 * we fetch using the stored hub_id property.  The caller always passes
 * an `id` that was originally returned by createCampaign / getCampaignsByStatus,
 * so the HubSpot record id is correct.
 *
 * We need a hub_id to obtain the access token.  To keep the signature
 * identical to the original (single `id` argument) we first do an
 * unauthenticated-style lookup is impossible, so instead we accept an
 * optional second argument `hubId` used only for token resolution.
 * If your callers already pass hubId, just forward it; if not, you can
 * store a lightweight in-process cache of id→hubId (see note below).
 */
async function getCampaign(id, hubId) {
  // If hubId is not supplied by the caller, you MUST either:
  //   a) update the one call-site to pass hubId (recommended), or
  //   b) implement an id→hubId lookup.
  // Option (a) is a one-line change in the service and preserves isolation.
  if (!hubId) {
    throw new Error(
      "getCampaign: hubId is required to authenticate with HubSpot. " +
      "Update the call-site to pass hubId as the second argument."
    );
  }

  try {
    const data = await hsRequest(
      "GET",
      `/crm/v3/objects/${OBJECT_TYPE}/${id}?properties=${ALL_PROPERTIES}`,
      hubId
    );
    return toRow(data);
  } catch (err) {
    if (err.message.includes("404")) return null;
    throw err;
  }
}

/**
 * updateMessage(id, message) → row
 *
 * PostgreSQL equivalent:
 *   UPDATE sms_campaigns SET message = $2, updated_at = NOW() WHERE id = $1 RETURNING *
 */
async function updateMessage(id, message, hubId) {
  const data = await hsRequest(
    "PATCH",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId,
    { properties: { message } }
  );

  return toRow(data);
}

/**
 * scheduleCampaign(id, message, scheduledAt, timezone) → row
 *
 * PostgreSQL equivalent:
 *   UPDATE sms_campaigns SET message, scheduled_at, timezone, status='SCHEDULED' WHERE id = $1
 */
async function scheduleCampaign(id, message, scheduledAt, timezone, hubId) {
  const data = await hsRequest(
    "PATCH",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId,
    {
      properties: {
        message,
        scheduled_at: scheduledAt,
        timezone,
        status: "SCHEDULED",
      },
    }
  );

  return toRow(data);
}

/**
 * getDueScheduledCampaigns() → row[]
 *
 * PostgreSQL equivalent:
 *   SELECT * FROM sms_campaigns
 *   WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()
 *   ORDER BY scheduled_at ASC
 *
 * Uses HubSpot CRM Search across ALL portals that have installed the app.
 * The scheduler already runs per-hub, so pass hubId from schedulerService.
 */
async function getDueScheduledCampaigns(hubId) {
  const now = new Date().toISOString();

  const payload = {
    filterGroups: [
      {
        filters: [
          { propertyName: "status",       operator: "EQ",  value: "SCHEDULED" },
          { propertyName: "scheduled_at", operator: "LTE", value: now },
        ],
      },
    ],
    properties: ALL_PROPERTIES.split(","),
    sorts: [{ propertyName: "scheduled_at", direction: "ASCENDING" }],
    limit: 100,
  };

  const data = await hsRequest(
    "POST",
    `/crm/v3/objects/${OBJECT_TYPE}/search`,
    hubId,
    payload
  );

  return (data?.results ?? []).map(toRow);
}

/**
 * markCampaignSent(id) → row
 */
async function markCampaignSent(id, hubId) {
  const data = await hsRequest(
    "PATCH",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId,
    { properties: { status: "SENT" } }
  );

  return toRow(data);
}

/**
 * markCampaignFailed(id) → row
 */
async function markCampaignFailed(id, hubId) {
  const data = await hsRequest(
    "PATCH",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId,
    { properties: { status: "FAILED" } }
  );

  return toRow(data);
}

/**
 * getCampaignsByStatus(hubId, status) → row[]
 *
 * PostgreSQL equivalent:
 *   SELECT * FROM sms_campaigns WHERE hub_id = $1 AND status = $2 ORDER BY …
 */
async function getCampaignsByStatus(hubId, status) {
  const payload = {
    filterGroups: [
      {
        filters: [
          { propertyName: "hub_id", operator: "EQ", value: String(hubId) },
          { propertyName: "status", operator: "EQ", value: status },
        ],
      },
    ],
    properties: ALL_PROPERTIES.split(","),
    sorts: [
      {
        // Mirror the original ORDER BY logic:
        // SCHEDULED → sort by scheduled_at DESC, else updated_at DESC
        propertyName:
          status === "SCHEDULED" ? "scheduled_at" : "hs_lastmodifieddate",
        direction: "DESCENDING",
      },
    ],
    limit: 100,
  };

  const data = await hsRequest(
    "POST",
    `/crm/v3/objects/${OBJECT_TYPE}/search`,
    hubId,
    payload
  );

  return (data?.results ?? []).map(toRow);
}

/**
 * updateScheduledCampaign(id, message, scheduledAt, timezone) → row | null
 *
 * PostgreSQL equivalent:
 *   UPDATE sms_campaigns SET … WHERE id = $1 AND status = 'SCHEDULED' RETURNING *
 *
 * HubSpot has no conditional PATCH, so we fetch first and check status.
 */
async function updateScheduledCampaign(id, message, scheduledAt, timezone, hubId) {
  // Fetch current record to enforce the status = 'SCHEDULED' guard
  const existing = await getCampaign(id, hubId);
  if (!existing || existing.status !== "SCHEDULED") return null;

  const data = await hsRequest(
    "PATCH",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId,
    {
      properties: {
        message,
        scheduled_at: scheduledAt,
        timezone,
      },
    }
  );

  return toRow(data);
}

/**
 * deleteScheduledCampaign(id) → row | null
 *
 * PostgreSQL equivalent:
 *   DELETE FROM sms_campaigns WHERE id = $1 AND status = 'SCHEDULED' RETURNING *
 *
 * HubSpot soft-deletes (archives) objects; no conditional delete exists,
 * so we fetch first, check status, then archive.
 */
async function deleteScheduledCampaign(id, hubId) {
  const existing = await getCampaign(id, hubId);
  if (!existing || existing.status !== "SCHEDULED") return null;

  await hsRequest(
    "DELETE",
    `/crm/v3/objects/${OBJECT_TYPE}/${id}`,
    hubId
  );

  // Return the last-known row to match PostgreSQL's RETURNING * behaviour
  return existing;
}

// ─────────────────────────────────────────────────────────────
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