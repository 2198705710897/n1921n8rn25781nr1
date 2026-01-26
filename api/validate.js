// Vercel serverless function for license validation with device binding
// Uses Supabase for automatic device registration and license key management
// Returns signed JWT token for server-side API enforcement

import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const masterKillSwitch = process.env.MASTER_KILL_SWITCH === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const supabase = createClient(supabaseUrl, supabaseKey);

const secretKey = new TextEncoder().encode(JWT_SECRET);

async function generateToken(licenseKey, deviceId) {
  const token = await new SignJWT({
    licenseKey: licenseKey.substring(0, 8) + '...',
    deviceId: deviceId,
    purpose: 'honed-license'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secretKey);

  return token;
}

export default async function handler(req, res) {
  // Set CORS headers FIRST - allow extension and web origins
  const origin = req.headers.origin;

  // Allow chrome-extension origins and approved web origins
  const allowedOrigins = [
    origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')),
    origin === 'https://trade.padre.gg',
    origin === 'https://axiom.trade'
  ];

  if (allowedOrigins.some(Boolean)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, deviceId } = req.query;

  if (masterKillSwitch) {
    return res.json({
      valid: false,
      reason: 'MAINTENANCE',
      message: 'Extension is temporarily disabled for maintenance.'
    });
  }

  if (!key || !deviceId) {
    return res.status(400).json({
      valid: false,
      reason: 'INVALID_REQUEST',
      message: 'License key and device ID are required'
    });
  }

  try {
    // Check if license key exists and is not revoked in Supabase
    const { data: licenseData, error: licenseError } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key', key)
      .single();

    if (licenseError && licenseError.code !== 'PGRST116') {
      throw licenseError;
    }

    // Check if key exists
    if (!licenseData) {
      return res.json({
        valid: false,
        reason: 'INVALID',
        message: 'Invalid license key.'
      });
    }

    // Check if key is revoked
    if (licenseData.revoked) {
      return res.json({
        valid: false,
        reason: 'REVOKED',
        message: 'License key has been revoked.'
      });
    }

    // Check device binding
    const { data: existingBinding, error: fetchError } = await supabase
      .from('device_bindings')
      .select('*')
      .eq('license_key', key)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    // Check for update notifications
    console.log('[Validate API] Fetching update notifications...');
    const { data: notification, error: notificationError } = await supabase
      .from('update_notifications')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log('[Validate API] Notification result:', notification);
    console.log('[Validate API] Notification error:', notificationError);

    if (notificationError && notificationError.code !== 'PGRST116') {
      console.error('[Validate API] Notification fetch error:', notificationError);
    }

    // Helper function to build response with optional notification
    function buildResponse(baseResponse) {
      if (notification && notification.is_active) {
        return {
          ...baseResponse,
          updateNotification: {
            active: true,
            message: notification.message
          }
        };
      }
      return baseResponse;
    }

    if (existingBinding) {
      if (existingBinding.device_id === deviceId) {
        const token = await generateToken(key, deviceId);
        return res.json(buildResponse({
          valid: true,
          reason: 'VALID',
          message: 'License validated successfully.',
          deviceId: deviceId,
          token: token
        }));
      } else {
        return res.json({
          valid: false,
          reason: 'DEVICE_MISMATCH',
          message: 'This license key is already bound to another device. Each key can only be used on one device.'
        });
      }
    } else {
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

      const token = await generateToken(key, deviceId);
      return res.json(buildResponse({
        valid: true,
        reason: 'VALID',
        message: 'License validated successfully. Device registered.',
        deviceId: deviceId,
        newDevice: true,
        token: token
      }));
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
