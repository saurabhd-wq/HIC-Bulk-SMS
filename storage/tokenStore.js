let tokens = null;

function saveTokens(tokenData) {
  tokens = tokenData;
}

function getTokens() {
  return tokens;
}

function clearTokens() {
  tokens = null;
}

module.exports = {
  saveTokens,
  getTokens,
  clearTokens,
};