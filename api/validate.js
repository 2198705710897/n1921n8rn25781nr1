export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const { key, deviceId } = req.query;

      if (!key) return res.status(400).json({ error: 'Missing key' });
      if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

      // Get device bindings
      const deviceBindings = process.env.DEVICE_BINDINGS || '';
      const bindings = {};

      if (deviceBindings) {
        deviceBindings.split(',').forEach(binding => {
          const [k, d] = binding.split(':');
          if (k && d) bindings[k] = d;
        });
      }

      // Check kill switch
      if (process.env.MASTER_KILL_SWITCH === 'true') {
        return res.status(200).json({
          valid: false,
          reason: 'MAINTENANCE',
          message: 'Extension temporarily disabled.'
        });
      }

      // Check if revoked
      const revokedKeys = process.env.REVOKED_KEYS?.split(',') || [];
      if (revokedKeys.includes(key)) {
        return res.status(200).json({
          valid: false,
          reason: 'REVOKED',
          message: 'License revoked.'
        });
      }

      // Check if key exists
      const boundDeviceId = bindings[key];

      if (!boundDeviceId) {
        return res.status(200).json({
          valid: false,
          reason: 'INVALID',
          message: 'Invalid license key.'
        });
      }

      // Check device match
      if (boundDeviceId !== deviceId) {
        return res.status(200).json({
          valid: false,
          reason: 'DEVICE_MISMATCH',
          message: 'License activated on different device.'
        });
      }

      console.log(`[License] Valid: ${key.substring(0, 8)}... device: ${deviceId}`);

      return res.status(200).json({
        valid: true,
        reason: 'VALID'
      });

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
