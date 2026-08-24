const cron = require("node-cron");
const smsCampaignRepository = require("../repositories/smsCampaignRepository");
const smsSendService = require("./smsSendService");
const pool = require("../config/database");

let task = null;

async function processDueCampaigns() {
  let allHubs = [];

  try {
    // ✅ PostgreSQL sirf hubspot_installations ke liye use ho raha hai — ye theek hai
    const result = await pool.query(`SELECT hub_id FROM hubspot_installations`);
    allHubs = result.rows.map((r) => r.hub_id);
  } catch (error) {
    console.error("Scheduler: failed to fetch hub list.", error.message);
    return; // DB down hai toh quietly skip karo, crash mat karo
  }

  for (const hubId of allHubs) {
    let dueCampaigns = [];

    try {
      dueCampaigns = await smsCampaignRepository.getDueScheduledCampaigns(hubId);
    } catch (error) {
      console.error(`Scheduler: failed to fetch campaigns for hub ${hubId}.`, error.message);
      continue;
    }

    for (const campaign of dueCampaigns) {
      try {
        await smsSendService.sendCampaignMessage(campaign, campaign.message);
        await smsCampaignRepository.markCampaignSent(campaign.id, hubId);
      } catch (error) {
        console.error(`Scheduler: campaign ${campaign.id} failed.`, error.message);
        try {
          await smsCampaignRepository.markCampaignFailed(campaign.id, hubId);
        } catch (markError) {
          console.error(`Scheduler: could not mark campaign ${campaign.id} as FAILED.`, markError.message);
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