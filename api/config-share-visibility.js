// API Endpoint: Toggle Config Visibility
// PATCH /api/config-share-visibility

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
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PATCH') {
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

    const { configId, isPublic } = req.body;

    if (!configId || typeof isPublic !== 'boolean') {
      return res.status(400).json({ error: 'Missing configId or isPublic' });
    }

    // Update config visibility (only own configs)
    const { data, error } = await supabase
      .from('shared_configs')
      .update({ is_public: isPublic })
      .eq('id', configId)
      .eq('device_id', deviceId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Config not found or access denied' });
    }

    return res.status(200).json({
      success: true,
      isPublic: data.is_public
    });

  } catch (error) {
    console.error('Toggle visibility error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
