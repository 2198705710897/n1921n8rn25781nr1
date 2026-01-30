// Combined Config Share API
// Routes to different handlers based on method and query params
//
// Routes:
// GET    /api/config-share?action=browse&page=1&limit=20&own=false  - Browse configs
// GET    /api/config-share?action=preview&id={configId}              - Preview config
// POST   /api/config-share?action=upload                             - Upload config
// POST   /api/config-share?action=copy&id={configId}                 - Copy config
// PATCH  /api/config-share?action=visibility                          - Toggle visibility
// DELETE /api/config-share?id={configId}                              - Delete config

export default async function handler(req, res) {
  console.log('[CONFIG-SHARE] Method:', req.method);
  console.log('[CONFIG-SHARE] Query:', req.query);
  console.log('[CONFIG-SHARE] Has auth:', !!req.headers.authorization);

  // Set CORS headers FIRST - allow any chrome-extension origin
  const origin = req.headers.origin;

  // Allow chrome-extension origins
  if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    console.log('[CONFIG-SHARE] OPTIONS request');
    return res.status(200).end();
  }

  try {
    console.log('[CONFIG-SHARE] Starting imports...');
    // Dynamic imports
    const { jwtVerify } = await import('jose');
    const { createClient } = await import('@supabase/supabase-js');

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
    console.log('[CONFIG-SHARE] JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('[CONFIG-SHARE] JWT_SECRET length:', JWT_SECRET.length);
    const secretKey = new TextEncoder().encode(JWT_SECRET);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Verify JWT and get device_id
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authorization.replace('Bearer ', '');
    let decoded;
    try {
      const { payload } = await jwtVerify(token, secretKey);
      console.log('JWT verified successfully:', payload);
      if (payload.purpose !== 'honed-license') {
        console.log('JWT purpose mismatch:', payload.purpose);
        return res.status(401).json({ error: 'Invalid token' });
      }
      decoded = payload;
    } catch (error) {
      console.log('JWT verification failed:', error.message);
      return res.status(401).json({ error: 'Invalid token', details: error.message });
    }

    const deviceId = decoded?.device_id;

    if (!deviceId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Route based on method and action
    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'preview') {
        return await handlePreview(req, res, deviceId, supabase);
      } else {
        // Default to browse
        return await handleBrowse(req, res, deviceId, supabase);
      }
    }

    if (req.method === 'POST') {
      const action = req.query.action || req.body?.action;

      if (action === 'copy') {
        return await handleCopy(req, res, deviceId, supabase);
      } else if (action === 'upload') {
        return await handleUpload(req, res, deviceId, supabase);
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }
    }

    if (req.method === 'PATCH') {
      const action = req.query.action || req.body?.action;

      if (action === 'visibility') {
        return await handleVisibility(req, res, deviceId, supabase);
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res, deviceId, supabase);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Config share API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Browse configs (GET /api/config-share?page=1&limit=20&own=false)
async function handleBrowse(req, res, deviceId, supabase) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const own = req.query.own === 'true';
  const offset = (page - 1) * limit;

  let query = supabase
    .from('shared_configs')
    .select('*', { count: 'exact' });

  if (own) {
    query = query.eq('device_id', deviceId);
  } else {
    query = query.eq('is_public', true).neq('device_id', deviceId);
  }

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
}

// Preview config (GET /api/config-share?action=preview&id={configId})
async function handlePreview(req, res, deviceId, supabase) {
  const configId = req.query.id;
  if (!configId) {
    return res.status(400).json({ error: 'Missing config ID' });
  }

  const { data, error } = await supabase
    .from('shared_configs')
    .select('*')
    .eq('id', configId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Config not found' });
  }

  // Check access permissions
  if (data.device_id !== deviceId && !data.is_public) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Increment view count
  await supabase
    .from('shared_configs')
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq('id', configId);

  return res.status(200).json({
    success: true,
    config: data
  });
}

// Upload config (POST /api/config-share?action=upload)
async function handleUpload(req, res, deviceId, supabase) {
  const { displayName, description, isPublic, configData } = req.body;

  if (!configData) {
    return res.status(400).json({ error: 'Missing config data' });
  }

  const adminsCount = configData.settings?.adminAlertsList?.length || 0;
  const tweetsCount = configData.settings?.trackedTweetsList?.length || 0;
  const blacklistCount = configData.settings?.adminBlacklistList?.length || 0;
  const configSizeBytes = JSON.stringify(configData).length;

  const MAX_SIZE = 5 * 1024 * 1024;
  if (configSizeBytes > MAX_SIZE) {
    return res.status(400).json({ error: 'Config size exceeds 5MB limit' });
  }

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
}

// Copy config (POST /api/config-share?action=copy&id={configId})
async function handleCopy(req, res, deviceId, supabase) {
  const configId = req.query.id;
  if (!configId) {
    return res.status(400).json({ error: 'Missing config ID' });
  }

  const { data, error } = await supabase
    .from('shared_configs')
    .select('*')
    .eq('id', configId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Config not found' });
  }

  if (!data.is_public && data.device_id !== deviceId) {
    return res.status(403).json({ error: 'Cannot copy private config' });
  }

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
}

// Toggle visibility (PATCH /api/config-share?action=visibility)
async function handleVisibility(req, res, deviceId, supabase) {
  const { configId, isPublic } = req.body;

  if (!configId || typeof isPublic !== 'boolean') {
    return res.status(400).json({ error: 'Missing configId or isPublic' });
  }

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
}

// Delete config (DELETE /api/config-share?id={configId})
async function handleDelete(req, res, deviceId, supabase) {
  const configId = req.query.id;
  if (!configId) {
    return res.status(400).json({ error: 'Missing config ID' });
  }

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
}
