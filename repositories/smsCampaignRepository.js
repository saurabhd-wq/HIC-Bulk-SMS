// repositories/smsCampaignRepository.js

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
    id:           hsObject.id,
    hub_id:       p.hub_id       ?? null,
    contact_ids:  p.contact_ids  ? JSON.parse(p.contact_ids) : [],
    message:      p.message      ?? null,
    status:       p.status       ?? null,
    scheduled_at: p.scheduled_at ?? null,
    timezone:     p.timezone     ?? null,
    updated_at:   p.hs_lastmodifieddate ?? null,
    created_at:   p.createdate          ?? null,
  };
}

const ALL_PROPERTIES = [
  "hub_id","contact_ids","message","status",
  "scheduled_at","timezone","hs_lastmodifieddate","createdate",
].join(",");

async function createCampaign(hubId, contactIds) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("POST", `/crm/v3/objects/${OT}`, hubId, {
    properties: {
      hub_id: String(hubId),
      contact_ids: JSON.stringify(contactIds),
      status: "DRAFT",
    },
  });
  return toRow(data);
}

async function getCampaign(id, hubId) {
  if (!hubId) throw new Error("getCampaign: hubId required.");
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  try {
    const data = await hsRequest("GET", `/crm/v3/objects/${OT}/${id}?properties=${ALL_PROPERTIES}`, hubId);
    return toRow(data);
  } catch (err) {
    if (err.message.includes("404")) return null;
    throw err;
  }
}

async function updateMessage(id, message, hubId) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("PATCH", `/crm/v3/objects/${OT}/${id}`, hubId, {
    properties: { message },
  });
  return toRow(data);
}

async function scheduleCampaign(id, message, scheduledAt, timezone, hubId) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("PATCH", `/crm/v3/objects/${OT}/${id}`, hubId, {
    properties: { message, scheduled_at: scheduledAt, timezone, status: "SCHEDULED" },
  });
  return toRow(data);
}

async function getDueScheduledCampaigns(hubId) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const now = new Date().toISOString();
  const data = await hsRequest("POST", `/crm/v3/objects/${OT}/search`, hubId, {
    filterGroups: [{
      filters: [
        { propertyName: "status",       operator: "EQ",  value: "SCHEDULED" },
        { propertyName: "scheduled_at", operator: "LTE", value: now },
      ],
    }],
    properties: ALL_PROPERTIES.split(","),
    sorts: [{ propertyName: "scheduled_at", direction: "ASCENDING" }],
    limit: 100,
  });
  return (data?.results ?? []).map(toRow);
}

async function markCampaignSent(id, hubId) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("PATCH", `/crm/v3/objects/${OT}/${id}`, hubId, {
    properties: { status: "SENT" },
  });
  return toRow(data);
}

async function markCampaignFailed(id, hubId) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("PATCH", `/crm/v3/objects/${OT}/${id}`, hubId, {
    properties: { status: "FAILED" },
  });
  return toRow(data);
}

async function getCampaignsByStatus(hubId, status) {
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("POST", `/crm/v3/objects/${OT}/search`, hubId, {
    filterGroups: [{
      filters: [
        { propertyName: "hub_id", operator: "EQ", value: String(hubId) },
        { propertyName: "status", operator: "EQ", value: status },
      ],
    }],
    properties: ALL_PROPERTIES.split(","),
    sorts: [{
      propertyName: status === "SCHEDULED" ? "scheduled_at" : "hs_lastmodifieddate",
      direction: "DESCENDING",
    }],
    limit: 100,
  });
  return (data?.results ?? []).map(toRow);
}

async function updateScheduledCampaign(id, message, scheduledAt, timezone, hubId) {
  const existing = await getCampaign(id, hubId);
  if (!existing || existing.status !== "SCHEDULED") return null;
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  const data = await hsRequest("PATCH", `/crm/v3/objects/${OT}/${id}`, hubId, {
    properties: { message, scheduled_at: scheduledAt, timezone },
  });
  return toRow(data);
}

async function deleteScheduledCampaign(id, hubId) {
  const existing = await getCampaign(id, hubId);
  if (!existing || existing.status !== "SCHEDULED") return null;
  const OT = await getObjectTypeId(hubId, "sms_campaign");
  await hsRequest("DELETE", `/crm/v3/objects/${OT}/${id}`, hubId);
  return existing;
}

module.exports = {
  createCampaign, getCampaign, updateMessage, scheduleCampaign,
  getDueScheduledCampaigns, markCampaignSent, markCampaignFailed,
  getCampaignsByStatus, updateScheduledCampaign, deleteScheduledCampaign,
};