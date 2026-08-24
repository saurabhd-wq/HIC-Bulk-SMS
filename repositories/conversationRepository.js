// repositories/conversationRepository.js
//
// Drop-in replacement for the PostgreSQL conversationRepository.
// All public method signatures and return shapes are preserved exactly.
// Storage layer: PostgreSQL → HubSpot Custom Object "SMS Conversation".
//
// HubSpot Custom Object internal name assumed: "sms_conversation"
// (adjust OBJECT_TYPE below if your portal uses a different internal name)

const oauthService = require("../services/oauthService");

const OBJECT_TYPE = "sms_conversation"; // HubSpot Custom Object internal name
const HS_API_BASE = "https://api.hubapi.com";

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function getToken(hubId) {
  return await oauthService.getValidAccessToken(hubId);
}

async function hsRequest(method, path, hubId, body = null) {
  let token = await getToken(hubId);

  async function makeRequest(accessToken) {
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body !== null) {
      options.body = JSON.stringify(body);
    }

    return await fetch(`${HS_API_BASE}${path}`, options);
  }

  let res = await makeRequest(token);

  if (res.status === 401) {
    token = await oauthService.refreshAccessToken(hubId);
    res = await makeRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

/**
 * Maps a HubSpot Custom Object result → the row shape callers expect.
 *
 * PostgreSQL row shape (from SELECT in getConversationByContactId):
 *   { id, hubspot_contact_id, phone_number, twilio_message_sid,
 *     direction, message, status, created_at }
 */
function toRow(hsObject) {
  if (!hsObject) return null;

  const p = hsObject.properties || {};

  return {
    id:                   hsObject.id,
    hubspot_contact_id:   p.contact_ids        ?? null, // stored as contact_ids per spec
    phone_number:         p.phone_number        ?? null,
    twilio_message_sid:   p.twilio_message_sid  ?? null,
    direction:            p.direction           ?? null,
    message:              p.message             ?? null,
    status:               p.status              ?? null,
    created_at:           p.createdate          ?? null,
  };
}

const ALL_PROPERTIES = [
  "contact_ids",
  "phone_number",
  "twilio_message_sid",
  "direction",
  "message",
  "status",
  "createdate",
].join(",");

// ─────────────────────────────────────────────────────────────
// Public API  (identical signatures to the PostgreSQL version)
// ─────────────────────────────────────────────────────────────

/**
 * getConversationByContactId(contactId, phoneNumber, hubId) → row[]
 *
 * PostgreSQL equivalent:
 *   SELECT … FROM sms_conversations
 *   WHERE hubspot_contact_id = $1 AND phone_number = $2
 *   ORDER BY created_at ASC
 */
async function getConversationByContactId(contactId, phoneNumber, hubId) {
  const payload = {
    filterGroups: [
      {
        filters: [
          { propertyName: "contact_ids",  operator: "EQ", value: String(contactId) },
          { propertyName: "phone_number", operator: "EQ", value: phoneNumber },
        ],
      },
    ],
    properties: ALL_PROPERTIES.split(","),
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    limit: 200,
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
 * saveOutgoingMessage({ contactId, phoneNumber, twilioMessageSid, message, status, hubId })
 * → row
 *
 * PostgreSQL equivalent:
 *   INSERT INTO sms_conversations (hubspot_contact_id, phone_number,
 *     twilio_message_sid, direction, message, status)
 *   VALUES (…, 'outbound', …) RETURNING *
 */
async function saveOutgoingMessage({
  contactId,
  phoneNumber,
  twilioMessageSid,
  message,
  status,
  hubId,           // added — needed for token resolution
}) {
  const data = await hsRequest(
    "POST",
    `/crm/v3/objects/${OBJECT_TYPE}`,
    hubId,
    {
      properties: {
        contact_ids:        String(contactId),
        phone_number:       phoneNumber,
        twilio_message_sid: twilioMessageSid,
        direction:          "outbound",
        message,
        status,
      },
    }
  );

  return toRow(data);
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  getConversationByContactId,
  saveOutgoingMessage,
};