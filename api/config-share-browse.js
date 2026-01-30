// API Endpoint: Browse Shared Configs
// GET /api/config-share-browse?page=1&limit=20&own=false

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const own = req.query.own === 'true';
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('shared_configs')
      .select('*', { count: 'exact' });

    if (own) {
      // Show user's own configs (both public and private)
      query = query.eq('device_id', deviceId);
    } else {
      // Show public configs from other users
      query = query.eq('is_public', true).neq('device_id', deviceId);
    }

    // Execute query with pagination
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch configs' });
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return res.status(200).json({
      success: true,
      configs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages
      }
    });

  } catch (error) {
    console.error('Browse configs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
