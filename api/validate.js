// Vercel serverless function for license validation with device binding
// Uses Supabase for automatic device registration
// Returns signed JWT token for server-side API enforcement

import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const revokedKeys = process.env.REVOKED_KEYS ? process.env.REVOKED_KEYS.split(',') : [];
const masterKillSwitch = process.env.MASTER_KILL_SWITCH === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const VALID_LICENSE_KEYS = process.env.LICENSE_KEYS ? process.env.LICENSE_KEYS.split(',') : [];

const supabase = createClient(supabaseUrl, supabaseKey);

// Create a secret key for JWT signing
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Generate a signed JWT token for validated license
 * @param {string} licenseKey - The validated license key
 * @param {string} deviceId - The device ID
 * @returns {Promise<string>} Signed JWT token
 */
async function generateToken(licenseKey, deviceId) {
  const token = await new SignJWT({
    licenseKey: licenseKey.substring(0, 8) + '...', // Partial key for logging
    deviceId: deviceId,
    purpose: 'honed-license'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Token expires in 5 minutes
    .sign(secretKey);

  return token;
}

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
        // Same device - valid, generate token
        const token = await generateToken(key, deviceId);
        return res.json({
          valid: true,
          reason: 'VALID',
          message: 'License validated successfully.',
          deviceId: deviceId,
          token: token
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

      // Successfully registered new device, generate token
      const token = await generateToken(key, deviceId);
      return res.json({
        valid: true,
        reason: 'VALID',
        message: 'License validated successfully. Device registered.',
        deviceId: deviceId,
        newDevice: true,
        token: token
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

/**
 * Verify JWT token (exported for use in other API endpoints)
 * @param {string} token - JWT token to verify
 * @returns {Promise<object|null>} Decoded payload if valid, null if invalid
 */
export async function verifyToken(token) {
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
