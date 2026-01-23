export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const endpoint = req.query.endpoint || '/user/info';
      const apiKey = process.env.TWITTER_API_KEY;

      const response = await fetch(`https://api.twitterapi.io/twitter${endpoint}?${new URLSearchParams(req.query)}`, {
        headers: { 'X-API-Key': apiKey }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Twitter API error');
      }

      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
