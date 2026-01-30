// API Endpoint: Upload Config to Cloud
// POST /api/config-share-upload

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

    const { displayName, description, isPublic, configData } = req.body;

    // Validate required fields
    if (!configData) {
      return res.status(400).json({ error: 'Missing config data' });
    }

    // Calculate stats from config data
    const adminsCount = configData.settings?.adminAlertsList?.length || 0;
    const tweetsCount = configData.settings?.trackedTweetsList?.length || 0;
    const blacklistCount = configData.settings?.adminBlacklistList?.length || 0;
    const configSizeBytes = JSON.stringify(configData).length;

    // Check size limit (5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (configSizeBytes > MAX_SIZE) {
      return res.status(400).json({ error: 'Config size exceeds 5MB limit' });
    }

    // Insert config into database
    const { data, error } = await supabase
      .from('shared_configs')
      .insert({
        device_id: deviceId,
        display_name: displayName || null,
        description: description || null,
        is_public: isPublic || false,
        config_data: configData,
        admins_count: adminsCount,
        tweets_count: tweetsCount,
        blacklist_count: blacklistCount,
        config_size_bytes: configSizeBytes
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to upload config' });
    }

    return res.status(200).json({
      success: true,
      configId: data.id,
      message: 'Config uploaded successfully'
    });

  } catch (error) {
    console.error('Upload config error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
