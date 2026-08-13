const cron = require("node-cron");
const smsCampaignRepository = require("../repositories/smsCampaignRepository");
const smsSendService = require("./smsSendService");

let task = null;

async function processDueCampaigns() {
  // ⚠️ Problem: getDueScheduledCampaigns ko hubId chahiye
  // lekin scheduler sabhi hubs ke liye chalta hai.
  // Solution: sabhi installed hubs fetch karo, phir har hub ke liye check karo.

  const { getInstallation } = require("../repositories/installationRepository");
  const pool = require("../config/database");

  let allHubs = [];

  try {
    const result = await pool.query(`SELECT hub_id FROM hubspot_installations`);
    allHubs = result.rows.map((r) => r.hub_id);
  } catch (error) {
    console.error("Scheduler: failed to fetch hub list.", error);
    return;
  }

  for (const hubId of allHubs) {
    let dueCampaigns = [];

    try {
      dueCampaigns = await smsCampaignRepository.getDueScheduledCampaigns(hubId); // ✅
    } catch (error) {
      console.error(`Scheduler: failed to fetch due campaigns for hub ${hubId}.`, error);
      continue;
    }

    for (const campaign of dueCampaigns) {
      try {
        await smsSendService.sendCampaignMessage(campaign, campaign.message);
        await smsCampaignRepository.markCampaignSent(campaign.id, hubId); // ✅
      } catch (error) {
        console.error(`Scheduler: campaign ${campaign.id} failed.`, error);

        try {
          await smsCampaignRepository.markCampaignFailed(campaign.id, hubId); // ✅
        } catch (markError) {
          console.error(`Scheduler: failed to mark campaign ${campaign.id} as FAILED.`, markError);
        }
      }
    }
  }
}

function start() {
  if (task) return;

  task = cron.schedule("* * * * *", () => {
    processDueCampaigns();
  });

  console.log("Scheduler started: checking for scheduled campaigns every minute.");
}

module.exports = {
  start,
  processDueCampaigns,
};