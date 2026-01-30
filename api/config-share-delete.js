// API Endpoint: Delete Shared Config
// DELETE /api/config-share-delete?id={configId}

import { verifyJWT } from '../shared/jwt-utils.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify JWT and get device_id
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authorization.replace('Bearer ', '');
    const decoded = verifyJWT(token);
    const deviceId = decoded.device_id;

    if (!deviceId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const configId = req.query.id;
    if (!configId) {
      return res.status(400).json({ error: 'Missing config ID' });
    }

    // Delete config (only own configs)
    const { data, error } = await supabase
      .from('shared_configs')
      .delete()
      .eq('id', configId)
      .eq('device_id', deviceId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Config not found or access denied' });
    }

    return res.status(200).json({
      success: true,
      message: 'Config deleted successfully'
    });

  } catch (error) {
    console.error('Delete config error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
