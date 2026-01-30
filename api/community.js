import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Verify JWT token for license validation
 * @param {string} token - JWT token to verify
 * @returns {Promise<object|null>} Decoded payload if valid, null if invalid
 */
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.purpose !== 'honed-license') {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers FIRST - allow any chrome-extension origin
  const origin = req.headers.origin;

  // Allow chrome-extension origins
  if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify license token (this is the real security check)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }

  // Log the API request (don't fail if logging errors)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    await supabase.from('api_requests').insert({
      license_key: payload.licenseKey,
      device_id: payload.deviceId,
      endpoint: 'community',
      ip_address: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null
    });
  } catch (logError) {
    console.error('[Community API] Logging error:', logError);
  }

  try {
    const { communityId } = req.query;
    if (!communityId) return res.status(400).json({ error: 'Missing communityId' });

    const apiKey = process.env.TWITTER_API_KEY;
    const response = await fetch(`https://api.twitterapi.io/twitter/community/info?community_id=${communityId}`, {
      headers: { 'X-API-Key': apiKey }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Twitter API error');

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
