export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Missing key' });

      // Get valid keys from environment (comma-separated)
      const validKeys = process.env.VALID_LICENSE_KEYS?.split(',') || [];
      const revokedKeys = process.env.REVOKED_KEYS?.split(',') || [];
      const masterKillSwitch = process.env.MASTER_KILL_SWITCH === 'true';

      // Check master kill switch
      if (masterKillSwitch) {
        return res.status(200).json({
          valid: false,
          reason: 'MAINTENANCE',
          message: 'Extension is temporarily disabled for maintenance. Please check back later.'
        });
      }

      // Check if key is revoked
      if (revokedKeys.includes(key)) {
        return res.status(200).json({
          valid: false,
          reason: 'REVOKED',
          message: 'Your license has been revoked. Please contact support.'
        });
      }

      // Check if key is valid
      const isValid = validKeys.includes(key);

      // Log usage (you can add Vercel analytics or a database here)
      console.log(`Validation check: ${key.substring(0, 8)}... - Valid: ${isValid} - ${new Date().toISOString()}`);

      return res.status(200).json({
        valid: isValid,
        reason: isValid ? 'VALID' : 'INVALID',
        message: isValid ? 'License valid' : 'Invalid license key. Please purchase a license to use this extension.'
      });

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
