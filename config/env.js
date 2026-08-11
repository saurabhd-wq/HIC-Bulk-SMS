require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,

  HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID,
  HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET,
  HUBSPOT_REDIRECT_URI: process.env.HUBSPOT_REDIRECT_URI,
};