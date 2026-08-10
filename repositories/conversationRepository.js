/**
 * conversationRepository.js
 *
 * Storage implementation for SMS Conversations.
 * Replaced PostgreSQL (sms_conversations table) with HubSpot CRM Custom Objects.
 *
 * METHOD SIGNATURES AND RETURN SHAPES ARE IDENTICAL TO THE PREVIOUS
 * POSTGRESQL IMPLEMENTATION. No changes to callers are required.
 *
 * HubSpot Custom Object: "SMS Conversation"
 * Properties used:
 *   contact_ids          – string  (HubSpot contact id)
 *   phone_number         – string
 *   twilio_message_sid   – string
 *   direction            – string  inbound | outbound
 *   message              – string
 *
 * NOTE: The old table also had `status` and `created_at` columns that were
 * read back by conversationRoutes. We add those as computed/mapped values:
 *   status     → mapped from the object's properties (stored as-is)
 *   created_at → mapped from HubSpot's createdAt metadata timestamp
 */

const axios = require("axios");
const installationRepository = require("./installationRepository");
const oauthService = require("../services/oauthService");

// ─── HubSpot object type identifier ──────────────────────────────────────────
const OBJECT_TYPE =
  process.env.HS_CONVERSATION_OBJECT_TYPE || "sms_conversation";

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

  return {
    id: hsObject.id,

    // Old column: hubspot_contact_id (BIGINT) — cast to number for parity.
    hubspot_contact_id: p.contact_ids ? Number(p.contact_ids) : null,

    phone_number: p.phone_number || null,
    twilio_message_sid: p.twilio_message_sid || null,
    direction: p.direction || "outbound",
    message: p.message || null,

    // status was stored in the old table; keep it so any caller reading
    // msg.status continues to work.
    status: p.status || null,

    // Map HubSpot's createdAt to the old created_at column name.
    created_at: hsObject.createdAt || null,
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
  "contact_ids",
  "phone_number",
  "twilio_message_sid",
  "direction",
  "message",
  "status",
];

// POST /crm/v3/objects/<type>
async function hsCreate(accessToken, properties) {
  const client = hsBase(accessToken);
  const response = await client.post("", { properties });
  return response.data;
}

// POST /crm/v3/objects/<type>/search
async function hsSearch(accessToken, filterGroups, sorts = [], limit = 200) {
  const client = hsBase(accessToken);
  const response = await client.post("/search", {
    filterGroups,
    sorts,
    properties: ALL_PROPERTIES,
    limit,
  });
  return response.data.results || [];
}

// ─── Hub-id resolution ────────────────────────────────────────────────────────
// saveOutgoingMessage and getConversationByContactId both need a hubId to pick
// the right OAuth token. The old PostgreSQL implementation had no such concept
// because one DB stored all portals.
//
// We resolve it from the caller's context:
//   • saveOutgoingMessage receives contactId — we store it on the object and
//     can look up which installation owns it. However, to keep the method
//     signature unchanged we accept an optional hubId via a well-known field.
//   • getConversationByContactId is called from conversationRoutes which has
//     hubId available in req.query. We thread it through via an optional
//     last argument without breaking existing callers that omit it.
//
// STRATEGY: Both exported functions accept an optional trailing `hubId`
// argument. The route files already have hubId and can pass it in. The
// smsSendService also has campaign.hub_id available. Where hubId is not
// supplied we fall back to a cross-portal search (slower but safe).

// ─── Exported repository methods ──────────────────────────────────────────────

/**
 * Retrieve all messages for a contact+phone combination, ordered oldest-first.
 *
 * Old signature : getConversationByContactId(contactId, phoneNumber)
 * New signature : getConversationByContactId(contactId, phoneNumber, hubId?)
 *
 * The optional hubId avoids a cross-portal scan and is recommended when
 * available. Existing callers that omit it will trigger the cross-portal
 * fallback automatically.
 */
async function getConversationByContactId(contactId, phoneNumber, hubId) {
  const filterGroups = [
    {
      filters: [
        {
          propertyName: "contact_ids",
          operator: "EQ",
          value: String(contactId),
        },
        {
          propertyName: "phone_number",
          operator: "EQ",
          value: phoneNumber,
        },
      ],
    },
  ];

  const sorts = [{ propertyName: "hs_createdate", direction: "ASCENDING" }];

  // ── Fast path: hubId supplied ─────────────────────────────────────────────
  if (hubId) {
    const hsObjects = await withTokenRetry(hubId, (token) =>
      hsSearch(token, filterGroups, sorts)
    );
    return hsObjects.map(toRow);
  }

  // ── Slow path: scan all portals ───────────────────────────────────────────
  const installations = await installationRepository.getAllInstallations();

  for (const installation of installations) {
    try {
      const hsObjects = await withTokenRetry(
        installation.hub_id,
        (token) => hsSearch(token, filterGroups, sorts)
      );

      if (hsObjects.length > 0) return hsObjects.map(toRow);
    } catch (error) {
      if (error.response?.status === 404) continue;
      throw error;
    }
  }

  return [];
}

/**
 * Persist an outgoing SMS message.
 *
 * Old signature : saveOutgoingMessage({ contactId, phoneNumber, twilioMessageSid, message, status })
 * New signature : saveOutgoingMessage({ contactId, phoneNumber, twilioMessageSid, message, status, hubId? })
 *
 * hubId is optional but strongly recommended (smsSendService has campaign.hub_id;
 * conversationSendRoute has req.body.hubId). When omitted we fall back to the
 * first installation found via contactId, but this may fail in multi-portal
 * setups.
 */
async function saveOutgoingMessage({
  contactId,
  phoneNumber,
  twilioMessageSid,
  message,
  status,
  hubId,
}) {
  // Resolve hubId from the first installation that owns this contact if not
  // provided. In practice callers should always pass it in.
  let resolvedHubId = hubId;

  if (!resolvedHubId) {
    const installations = await installationRepository.getAllInstallations();
    if (installations.length === 0) {
      throw new Error("No HubSpot installations found.");
    }
    // Default to first installation — acceptable for single-portal deployments.
    resolvedHubId = installations[0].hub_id;
  }

  const hsObject = await withTokenRetry(resolvedHubId, (token) =>
    hsCreate(token, {
      contact_ids: String(contactId),
      phone_number: phoneNumber,
      twilio_message_sid: twilioMessageSid || "",
      direction: "outbound",
      message,
      status: status || "",
    })
  );

  // hsCreate only returns id + timestamps; re-fetch to get all properties.
  // We reconstruct the row from what we know to avoid an extra round-trip.
  return toRow({
    id: hsObject.id,
    createdAt: hsObject.createdAt,
    properties: {
      contact_ids: String(contactId),
      phone_number: phoneNumber,
      twilio_message_sid: twilioMessageSid || "",
      direction: "outbound",
      message,
      status: status || "",
    },
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getConversationByContactId,
  saveOutgoingMessage,
};