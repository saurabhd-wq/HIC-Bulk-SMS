const express = require("express");
const router = express.Router();

const hubspotPropertiesService = require("../services/hubspotPropertiesService");

// GET /api/merge-fields?hubId=123           -> all four sections
// GET /api/merge-fields?hubId=123&object=contact -> lazy-load one section
router.get("/", async (req, res) => {
  try {
    const hubId = Number(req.query.hubId);
    const { object } = req.query;

    if (!hubId) {
      return res.status(400).json({ success: false, message: "hubId is required." });
    }

    if (object) {
      const properties = await hubspotPropertiesService.getProperties(hubId, object);
      return res.json({ [object]: properties });
    }

    const all = await hubspotPropertiesService.getAllProperties(hubId);
    res.json(all);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;