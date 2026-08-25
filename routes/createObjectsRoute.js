const express = require("express");
const axios = require("axios");

const router = express.Router();

const HUBSPOT_API = "https://api.hubapi.com";

const OBJECT_DEFINITIONS = [
  {
    name: "p_sms_campaign", // HubSpot Custom Object internal name
    labels: {
      singular: "SMS Campaign",
      plural: "SMS Campaigns",
    },
    description: "Stores bulk SMS campaign information.",
    primaryDisplayProperty: "hub_id",
    secondaryDisplayProperties: ["status", "scheduled_at"],
    searchableProperties: ["hub_id", "contact_ids", "status"],
    properties: [
      {
        name: "hub_id",
        label: "Hub ID",
        type: "string",
        fieldType: "text",
      },
      {
        name: "contact_ids",
        label: "Contact IDs",
        type: "string",
        fieldType: "textarea",
      },
      {
        name: "message",
        label: "Message",
        type: "string",
        fieldType: "textarea",
      },
      {
        name: "status",
        label: "Status",
        type: "enumeration",
        fieldType: "select",
        options: [
          { label: "Pending", value: "PENDING" },
          { label: "Scheduled", value: "SCHEDULED" },
          { label: "Sent", value: "SENT" },
          { label: "Failed", value: "FAILED" },
        ],
      },
      {
        name: "scheduled_at",
        label: "Scheduled At",
        type: "string",
        fieldType: "text",
      },
      {
        name: "timezone",
        label: "Timezone",
        type: "string",
        fieldType: "text",
      },
    ],
  },

  {
    name: "p_sms_conversation",
    labels: {
      singular: "SMS Conversation",
      plural: "SMS Conversations",
    },
    description: "Stores SMS conversation messages.",
    primaryDisplayProperty: "phone_number",
    secondaryDisplayProperties: ["direction", "twilio_message_sid"],
    searchableProperties: [
      "contact_ids",
      "phone_number",
      "twilio_message_sid",
    ],
    properties: [
      {
        name: "contact_ids",
        label: "Contact ID",
        type: "string",
        fieldType: "text",
      },
      {
        name: "phone_number",
        label: "Phone Number",
        type: "phone_number",
        fieldType: "phonenumber",
      },
      {
        name: "twilio_message_sid",
        label: "Twilio Message SID",
        type: "string",
        fieldType: "text",
      },
      {
        name: "direction",
        label: "Direction",
        type: "enumeration",
        fieldType: "select",
        options: [
          { label: "Outbound", value: "OUTBOUND" },
          { label: "Inbound", value: "INBOUND" },
        ],
      },
      {
        name: "message",
        label: "Message",
        type: "string",
        fieldType: "textarea",
      },
    ],
  },
];

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getSchemas(token) {
  const response = await axios.get(
    `${HUBSPOT_API}/crm-object-schemas/v3/schemas`,
    {
      headers: authHeaders(token),
    }
  );

  return response.data?.results || [];
}

async function createObjectIfMissing(token, definition, schemas) {
  const existing = schemas.find(
    (schema) => schema.name === definition.name
  );

  if (existing) {
    return {
      name: definition.name,
      status: "already_exists",
      objectTypeId: existing.objectTypeId || existing.id,
      fullyQualifiedName: existing.fullyQualifiedName,
    };
  }

  const response = await axios.post(
    `${HUBSPOT_API}/crm-object-schemas/v3/schemas`,
    {
      metaType: "PORTAL_SPECIFIC",

      name: definition.name,

      labels: definition.labels,

      description: definition.description,

      associatedObjects: ["CONTACT"],

      primaryDisplayProperty: definition.primaryDisplayProperty,

      secondaryDisplayProperties:
        definition.secondaryDisplayProperties,

      searchableProperties:
        definition.searchableProperties,

      requiredProperties: [],

      properties: definition.properties,
    },
    {
      headers: authHeaders(token),
    }
  );

  return {
    name: definition.name,
    status: "created",
    objectTypeId:
      response.data?.objectTypeId || response.data?.id,
    fullyQualifiedName:
      response.data?.fullyQualifiedName,
  };
}

router.post("/", async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken || !accessToken.trim()) {
      return res.status(400).json({
        success: false,
        message: "Private App Access Token is required.",
      });
    }

    const token = accessToken.trim();

    // IMPORTANT:
    // Token is only used for this request.
    // We do NOT save it anywhere.
    const schemas = await getSchemas(token);

    const results = [];

    for (const definition of OBJECT_DEFINITIONS) {
      const result = await createObjectIfMissing(
        token,
        definition,
        schemas
      );

      results.push(result);
    }

    return res.json({
      success: true,
      message: "SMS objects setup completed.",
      results,
    });
  } catch (error) {
    console.error(
      "Create Objects Error:",
      error.response?.data || error.message
    );

    const status = error.response?.status || 500;

    let message = "Failed to create SMS objects.";

    if (status === 401) {
      message = "Invalid or expired Private App Access Token.";
    } else if (status === 403) {
      message =
        "Token does not have permission to create custom objects.";
    } else if (error.response?.data?.message) {
      message = error.response.data.message;
    }

    return res.status(status).json({
      success: false,
      message,
    });
  }
});

module.exports = router;