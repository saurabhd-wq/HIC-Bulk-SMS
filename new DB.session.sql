-- Table 1
CREATE TABLE hubspot_installations (
  id SERIAL PRIMARY KEY,
  hub_id BIGINT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 2
CREATE TABLE twilio_credentials (
  id SERIAL PRIMARY KEY,
  hub_id BIGINT UNIQUE NOT NULL,
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  from_number TEXT NOT NULL
);