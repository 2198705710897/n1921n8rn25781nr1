/**
 * Credit Tracking Helper
 *
 * Centralized credit deduction and activity logging for all API endpoints.
 * This ensures consistent credit tracking across the entire API.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Credit costs per endpoint
export const CREDIT_COSTS = {
  'validate': 1,           // Baseline operation
  'supabase': 20,          // Full data sync (heavy)
  'supabase/recent': 10,   // Incremental sync (medium)
  'twitter': 5,            // External API proxy
  'community': 5,          // External API proxy
  'sheets': 20,            // Legacy sheets sync (if used)
};

/**
 * Get IP address from request headers
 * @private
 */
function getIpAddress(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() :
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    null;
  return ip;
}

/**
 * Deduct credits for an API call and log activity
 *
 * @param {string} licenseKey - License key
 * @param {string} deviceId - Device ID
 * @param {string} endpoint - Endpoint name (must match CREDIT_COSTS key)
 * @param {object} req - Request object (for IP/User-Agent)
 * @param {object} options - Optional parameters
 * @param {number} options.statusCode - HTTP response status code
 * @param {boolean} options.success - Whether the operation succeeded
 * @param {string} options.errorReason - Error reason if failed
 * @returns {Promise<object>} Result with success status and credit info
 */
export async function trackApiUsage(licenseKey, deviceId, endpoint, req = null, options = {}) {
  const {
    statusCode = 200,
    success = true,
    errorReason = null
  } = options;

  const creditsToDeduct = success ? (CREDIT_COSTS[endpoint] || 1) : 0;

  try {
    // Get current device binding
    const { data: binding, error: fetchError } = await supabase
      .from('device_bindings')
      .select('credits_remaining, total_credits_used')
      .eq('license_key', licenseKey)
      .eq('device_id', deviceId)
      .single();

    if (fetchError || !binding) {
      console.error('[Credits] Device binding not found:', licenseKey, deviceId);
      return {
        success: false,
        creditsRemaining: null,
        error: 'Device binding not found'
      };
    }

    const creditsRemaining = binding.credits_remaining ?? 0;

    // Check if user has enough credits (only for successful operations)
    if (success && creditsRemaining < creditsToDeduct) {
      console.warn('[Credits] Insufficient credits:', {
        licenseKey,
        deviceId,
        needed: creditsToDeduct,
        available: creditsRemaining
      });
      return {
        success: false,
        creditsRemaining,
        error: `Insufficient credits. Need ${creditsToDeduct}, have ${creditsRemaining}`
      };
    }

    // Prepare update data
    const ip = req ? getIpAddress(req) : null;
    const userAgent = req?.headers?.['user-agent'] || null;

    const updateData = {
      last_seen: new Date().toISOString(),
      last_ip: ip,
      last_user_agent: userAgent,
      last_endpoint: endpoint,
    };

    // Only deduct credits on successful operations
    if (success) {
      updateData.credits_remaining = creditsRemaining - creditsToDeduct;
      updateData.total_credits_used = (binding.total_credits_used || 0) + creditsToDeduct;
      updateData.last_credit_usage = new Date().toISOString();
    }

    // Update device binding
    const { error: updateError } = await supabase
      .from('device_bindings')
      .update(updateData)
      .eq('license_key', licenseKey)
      .eq('device_id', deviceId);

    if (updateError) {
      console.error('[Credits] Update error:', updateError);
      return {
        success: false,
        creditsRemaining: null,
        error: updateError.message
      };
    }

    // Log activity asynchronously (don't wait for it)
    logActivity(licenseKey, deviceId, endpoint, creditsToDeduct, ip, userAgent, statusCode, success, errorReason)
      .catch(err => console.error('[Credits] Activity log error:', err));

    return {
      success: true,
      creditsRemaining: success ? creditsRemaining - creditsToDeduct : creditsRemaining,
      creditsUsed: creditsToDeduct,
      totalUsed: success ? (binding.total_credits_used || 0) + creditsToDeduct : binding.total_credits_used
    };

  } catch (error) {
    console.error('[Credits] Track usage error:', error);
    return {
      success: false,
      creditsRemaining: null,
      error: error.message
    };
  }
}

/**
 * Log activity to activity_logs table
 * @private
 */
async function logActivity(licenseKey, deviceId, endpoint, creditsUsed, ip, userAgent, statusCode, success, errorReason) {
  try {
    await supabase
      .from('activity_logs')
      .insert({
        license_key: licenseKey,
        device_id: deviceId,
        endpoint: endpoint,
        credits_used: creditsUsed,
        ip: ip,
        user_agent: userAgent,
        status_code: statusCode,
        success: success,
        error_reason: errorReason
      });
  } catch (error) {
    // Activity logging is non-critical, just log the error
    console.error('[Credits] Failed to log activity:', error);
  }
}

/**
 * Check if a device has sufficient credits for an operation
 *
 * @param {string} licenseKey - License key
 * @param {string} deviceId - Device ID
 * @param {string} endpoint - Endpoint to check credits for
 * @returns {Promise<object>} Credit availability
 */
export async function checkCredits(licenseKey, deviceId, endpoint) {
  try {
    const { data: binding } = await supabase
      .from('device_bindings')
      .select('credits_remaining, total_credits_used')
      .eq('license_key', licenseKey)
      .eq('device_id', deviceId)
      .single();

    if (!binding) {
      return {
        hasEnough: false,
        creditsRemaining: 0,
        creditsNeeded: CREDIT_COSTS[endpoint] || 1
      };
    }

    const creditsNeeded = CREDIT_COSTS[endpoint] || 1;
    const creditsRemaining = binding.credits_remaining ?? 0;

    return {
      hasEnough: creditsRemaining >= creditsNeeded,
      creditsRemaining,
      creditsNeeded,
      totalUsed: binding.total_credits_used || 0
    };

  } catch (error) {
    console.error('[Credits] Check credits error:', error);
    return {
      hasEnough: false,
      creditsRemaining: 0,
      creditsNeeded: CREDIT_COSTS[endpoint] || 1
    };
  }
}

/**
 * Refill credits for a device (admin function)
 *
 * @param {string} licenseKey - License key
 * @param {string} deviceId - Device ID
 * @param {number} amount - Amount to add (or set to specific amount if negative)
 * @returns {Promise<object>} Result
 */
export async function refillCredits(licenseKey, deviceId, amount) {
  try {
    const { data: current } = await supabase
      .from('device_bindings')
      .select('credits_remaining')
      .eq('license_key', licenseKey)
      .eq('device_id', deviceId)
      .single();

    if (!current) {
      return { success: false, error: 'Device binding not found' };
    }

    const newBalance = amount < 0
      ? Math.abs(amount)  // Set to specific amount
      : (current.credits_remaining ?? 0) + amount;  // Add amount

    const { error } = await supabase
      .from('device_bindings')
      .update({ credits_remaining: newBalance })
      .eq('license_key', licenseKey)
      .eq('device_id', deviceId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      previousBalance: current.credits_remaining ?? 0,
      newBalance
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}
