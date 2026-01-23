import { google } from 'googleapis';

  export default async function handler(req, res) {
    // CORS - allow your extension to make requests
    const origin = req.headers.origin;
    if (origin?.includes('chrome-extension://')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Parse service account credentials from environment
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

      // Create auth using service account
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // Get range from query param (optional)
      const range = req.query.range;

      if (range) {
        // Single range fetch
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: range
        });
        res.json({ success: true, values: response.data.values || [] });
      } else {
        // Fetch all sheets (default behavior)
        const [adminResponse, tokensResponse, failedTokensResponse, commentsResponse] = await Promise.all([
          sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: "'Admins'!A1:N"
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
            range: "'Comments'!A1:F"
          }).catch(() => ({ data: { values: null } }))
        ]);

        res.json({
          success: true,
          admins: adminResponse.data.values || [],
          tokens: tokensResponse.data.values || [],
          failedTokens: failedTokensResponse.data.values || [],
          comments: commentsResponse.data.values || []
        });
      }

    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
