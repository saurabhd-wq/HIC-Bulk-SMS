// repositories/conversationRepository.js

const oauthService = require("../services/oauthService");
const { getObjectTypeId } = require("../services/objectTypeCache");

const HS_API_BASE = "https://api.hubapi.com";

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
    if (body !== null) options.body = JSON.stringify(body);
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

  if (res.status === 204) return null;
  return res.json();
}

function toRow(hsObject) {
  if (!hsObject) return null;
  const p = hsObject.properties || {};
  return {
    id:                 hsObject.id,
    hubspot_contact_id: p.contact_ids        ?? null,
    phone_number:       p.phone_number       ?? null,
    twilio_message_sid: p.twilio_message_sid ?? null,
    direction:          p.direction          ?? null,
    message:            p.message            ?? null,
    created_at:         hsObject.createdAt   ?? p.createdate ?? null,
  };
}

const ALL_PROPERTIES = [
  "contact_ids","phone_number","twilio_message_sid",
  "direction","message","createdate",
].join(",");

async function getConversationByContactId(contactId, phoneNumber, hubId) {
  const OT = await getObjectTypeId(hubId, "sms_conversation");
  const data = await hsRequest("POST", `/crm/v3/objects/${OT}/search`, hubId, {
    filterGroups: [{
      filters: [
        { propertyName: "contact_ids",  operator: "EQ", value: String(contactId) },
        { propertyName: "phone_number", operator: "EQ", value: phoneNumber },
      ],
    }],
    properties: ALL_PROPERTIES.split(","),
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    limit: 200,
  });
  return (data?.results ?? []).map(toRow);
}

async function saveOutgoingMessage({ contactId, phoneNumber, twilioMessageSid, message, status, hubId }) {
  const OT = await getObjectTypeId(hubId, "sms_conversation");
  const data = await hsRequest("POST", `/crm/v3/objects/${OT}`, hubId, {
    properties: {
      contact_ids:        String(contactId),
      phone_number:       phoneNumber,
      twilio_message_sid: twilioMessageSid,
      direction:          "OUTBOUND",
      message,
    },
  });
  return toRow(data);
}

module.exports = { getConversationByContactId, saveOutgoingMessage };