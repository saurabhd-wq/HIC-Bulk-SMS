const cron = require("node-cron");

const smsCampaignRepository = require("../repositories/smsCampaignRepository");
const smsSendService = require("./smsSendService");

let task = null;

async function processDueCampaigns() {
  let dueCampaigns = [];

  try {
    dueCampaigns = await smsCampaignRepository.getDueScheduledCampaigns();
  } catch (error) {
    console.error("Scheduler: failed to fetch due campaigns.", error);
    return;
  }

  for (const campaign of dueCampaigns) {
    try {
      await smsSendService.sendCampaignMessage(campaign, campaign.message);
      await smsCampaignRepository.markCampaignSent(campaign.id);
    } catch (error) {
      // Per-contact errors are already handled inside sendCampaignMessage;
      // this only catches unexpected top-level failures (e.g. a DB error).
      console.error(`Scheduler: campaign ${campaign.id} failed to send.`, error);

      try {
        await smsCampaignRepository.markCampaignFailed(campaign.id);
      } catch (markError) {
        console.error(
          `Scheduler: failed to mark campaign ${campaign.id} as FAILED.`,
          markError
        );
      }
    }
  }
}

function start() {
  if (task) return; // avoid double-scheduling if start() is called twice

  task = cron.schedule("* * * * *", () => {
    processDueCampaigns();
  });

  console.log("Scheduler started: checking for scheduled campaigns every minute.");
}

module.exports = {
  start,
  processDueCampaigns, // exported for manual testing if needed
};