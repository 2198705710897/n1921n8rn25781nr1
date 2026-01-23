import { google } from 'googleapis';

  // This file runs on Vercel's servers - credentials are safe here
  export default async function handler(req, res) {
    // CORS - allow your extension to make requests
    const origin = req.headers.origin;
    if (origin?.includes('chrome-extension://')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Get credentials from environment variables
      const credentials = {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage'
      };

      const auth = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        credentials.redirect_uri
      );

      auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // Fetch the Admin sheet
      const [adminResponse, tokensResponse, failedTokensResponse, commentsResponse] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'Admin!A1:N'
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: "'Tokens - Sorted by Admin'!A1:I"
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: "'Tokens - Failed (Under 10k)'!A1:I"
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'Comments!A1:F'
        }).catch(() => ({ values: null })) // Comments sheet might not exist
      ]);

      res.json({
        success: true,
        admins: adminResponse.data.values || [],
        tokens: tokensResponse.data.values || [],
        failedTokens: failedTokensResponse.data.values || [],
        comments: commentsResponse.data.values || []
      });

    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }