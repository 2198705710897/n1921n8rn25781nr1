import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const revokedKeys = process.env.REVOKED_KEYS ? process.env.REVOKED_KEYS.split(',') : [];
const masterKillSwitch = process.env.MASTER_KILL_SWITCH === 'true';

// Valid license keys (you would store this securely or use a database)
const VALID_LICENSE_KEYS = process.env.LICENSE_KEYS ? process.env.LICENSE_KEYS.split(',') : [];

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, deviceId } = req.query;

  // Check master kill switch
  if (masterKillSwitch) {
    return res.json({
      valid: false,
      reason: 'MAINTENANCE',
      message: 'Extension is temporarily disabled for maintenance.'
    });
  }

  // Validate required parameters
  if (!key || !deviceId) {
    return res.status(400).json({
      valid: false,
      reason: 'INVALID_REQUEST',
      message: 'License key and device ID are required'
    });
  }

  // Check if key is revoked
  if (revokedKeys.includes(key)) {
    return res.json({
      valid: false,
      reason: 'REVOKED',
      message: 'License key has been revoked.'
    });
  }

  // Check if license key is valid (your whitelist)
  if (!VALID_LICENSE_KEYS.includes(key)) {
    return res.json({
      valid: false,
      reason: 'INVALID',
      message: 'Invalid license key.'
    });
  }

  try {
    // Check if this key already has a device bound
    const { data: existingBinding, error: fetchError } = await supabase
      .from('device_bindings')
      .select('*')
      .eq('license_key', key)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is expected for new keys
      throw fetchError;
    }

    if (existingBinding) {
      // Key already has a device bound - check if it matches
      if (existingBinding.device_id === deviceId) {
        // Same device - valid
        return res.json({
          valid: true,
          reason: 'VALID',
          message: 'License validated successfully.',
          deviceId: deviceId
        });
      } else {
        // Different device - key already bound to another device
        return res.json({
          valid: false,
          reason: 'DEVICE_MISMATCH',
          message: 'This license key is already bound to another device. Each key can only be used on one device.'
        });
      }
    } else {
      // No device bound yet - automatically register this device
      const { error: insertError } = await supabase
        .from('device_bindings')
        .insert({
          license_key: key,
          device_id: deviceId,
          bound_at: new Date().toISOString()
        });

      if (insertError) {
        throw insertError;
      }

      // Successfully registered new device
      return res.json({
        valid: true,
        reason: 'VALID',
        message: 'License validated successfully. Device registered.',
        deviceId: deviceId,
        newDevice: true
      });
    }

  } catch (error) {
    console.error('[Validate API] Error:', error);
    return res.status(500).json({
      valid: false,
      reason: 'ERROR',
      message: 'Validation error. Please try again later.'
    });
  }
}
