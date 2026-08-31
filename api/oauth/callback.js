const { google } = require("googleapis");

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.status(400).send("Authorization was cancelled or denied: " + error);
    return;
  }
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res
        .status(200)
        .send(
          "No refresh token was returned (you may have already authorized this app before). " +
            "Revoke access at https://myaccount.google.com/permissions and try again so Google issues a new one."
        );
      return;
    }

    res
      .status(200)
      .send(
        "Authorization successful.\n\n" +
          "Copy this value into GOOGLE_OAUTH_REFRESH_TOKEN in your .env and Vercel project settings, " +
          "then close this page:\n\n" +
          tokens.refresh_token
      );
  } catch (err) {
    console.error("OAuth token exchange failed:", err);
    res.status(500).send("Token exchange failed. Check server logs.");
  }
};
