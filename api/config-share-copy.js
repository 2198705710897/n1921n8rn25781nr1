// API Endpoint: Copy Shared Config
// POST /api/config-share-copy?id={configId}

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
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

    // Fetch config
    const { data, error } = await supabase
      .from('shared_configs')
      .select('*')
      .eq('id', configId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Config not found' });
    }

    // Can only copy public configs (or own configs)
    if (!data.is_public && data.device_id !== deviceId) {
      return res.status(403).json({ error: 'Cannot copy private config' });
    }

    // Increment copy count and update last_copied_at
    await supabase
      .from('shared_configs')
      .update({
        copy_count: (data.copy_count || 0) + 1,
        last_copied_at: new Date().toISOString()
      })
      .eq('id', configId);

    return res.status(200).json({
      success: true,
      configData: data.config_data
    });

  } catch (error) {
    console.error('Copy config error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
