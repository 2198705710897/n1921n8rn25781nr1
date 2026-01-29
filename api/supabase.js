// Vercel serverless function for fetching admins and tokens from Supabase
// Replaces Google Sheets as the primary data source
// JWT authentication required

import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const supabase = createClient(supabaseUrl, supabaseKey);
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Verify JWT token for license validation
 * @param {string} token - JWT token to verify
 * @returns {Promise<object|null>} Decoded payload if valid, null if invalid
 */
async function verifyToken(token) {
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

/**
 * Calculate token age from Unix timestamp
 * @param {number} unixTimestamp - Unix timestamp in seconds
 * @returns {string} Formatted age string (e.g., "24d ago")
 */
function calculateTokenAge(unixTimestamp) {
  if (!unixTimestamp) return '';

  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Format migrate time from seconds to human readable format
 * @param {number} seconds - Average seconds to migration
 * @returns {string} Formatted time string (e.g., "1h 23m", "45m", "2h 15m")
 */
function formatMigrateTime(seconds) {
  if (!seconds || seconds === 0) return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return '< 1m';
  }
}

/**
 * Format timestamp - handles Unix timestamps (seconds as number or string) and ISO strings
 * @param {number|string} timestamp - Unix timestamp (seconds) or ISO date string
 * @returns {string} ISO date string or empty string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '';

  // If it's already an ISO format string (contains 'T' or '-'), return as-is
  if (typeof timestamp === 'string' && (timestamp.includes('T') || timestamp.includes('-'))) {
    return timestamp;
  }

  // Convert to number if it's a string representation of a Unix timestamp
  const numTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;

  // If we got a valid number, treat it as Unix timestamp in seconds
  if (typeof numTimestamp === 'number' && !isNaN(numTimestamp) && numTimestamp > 0) {
    return new Date(numTimestamp * 1000).toISOString();
  }

  return '';
}
  if (!unixTimestamp) return '';

  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Transform Supabase admins data to Sheets format (2D array)
 * @param {Array} admins - Admins from Supabase
 * @returns {Array} 2D array matching Sheets format
 */
function transformAdminsToSheetsFormat(admins) {
  if (!admins || admins.length === 0) {
    return [['admin_username', 'total_rating', 'tokens_score_0', 'tokens_score_1', 'tokens_score_2', 'tokens_score_3', 'tokens_score_4', 'tokens_score_5', 'tokens_score_6', 'total_tokens_created', 'winrate', 'avg_migrate_time', 'last_active', 'last_updated']];
  }

  const header = ['admin_username', 'total_rating', 'tokens_score_0', 'tokens_score_1', 'tokens_score_2', 'tokens_score_3', 'tokens_score_4', 'tokens_score_5', 'tokens_score_6', 'total_tokens_created', 'winrate', 'avg_migrate_time', 'last_active', 'last_updated'];

  const rows = admins.map(admin => [
    // Convert admin_username to lowercase to match parsing logic
    (admin.admin_username || '').toLowerCase().trim(),
    admin.total_rating?.toString() || '0',
    admin.tokens_score_0?.toString() || '0',
    admin.tokens_score_1?.toString() || '0',
    admin.tokens_score_2?.toString() || '0',
    admin.tokens_score_3?.toString() || '0',
    admin.tokens_score_4?.toString() || '0',
    admin.tokens_score_5?.toString() || '0',
    admin.tokens_score_6?.toString() || '0',
    admin.total_tokens_created?.toString() || '0',
    // Convert winrate from decimal (0-1) to percentage (0-100)
    ((admin.winrate || 0) * 100).toString(),
    // avg_migrate_time is in seconds, convert to human readable format
    admin.avg_migrate_time ? formatMigrateTime(admin.avg_migrate_time) : '',
    // Handle timestamp - could be Unix timestamp (number) or ISO string
    formatTimestamp(admin.last_active),
    // Handle timestamp - could be Unix timestamp (number) or ISO string
    formatTimestamp(admin.last_updated)
  ]);

  return [header, ...rows];
}

/**
 * Transform Supabase tokens data to Sheets format (2D array)
 * @param {Array} tokens - Tokens from Supabase
 * @returns {Array} 2D array matching Sheets format
 */
function transformTokensToSheetsFormat(tokens) {
  if (!tokens || tokens.length === 0) {
    return [['admin_username', 'base_token', 'token_name', 'token_symbol', 'community_link', 'token_age', 'market_cap', 'ath_market_cap', 'token_score']];
  }

  const header = ['admin_username', 'base_token', 'token_name', 'token_symbol', 'community_link', 'token_age', 'market_cap', 'ath_market_cap', 'token_score'];

  const rows = tokens.map(token => [
    // Convert admin_username to lowercase to match parsing logic
    (token.admin_username || '').toLowerCase().trim(),
    token.base_token || '',
    token.token_name || '',
    token.token_symbol || '',
    // Map twitter_url or website_url to community_link
    token.twitter_url || token.website_url || '',
    // Calculate token_age from created_at Unix timestamp
    calculateTokenAge(token.created_at),
    // market_cap is a REAL number, convert to string
    (token.market_cap ?? 0).toString(),
    // ath_market_cap is TEXT in Supabase - return as-is (already a string)
    token.ath_market_cap || '0',
    token.token_score?.toString() || '0'
  ]);

  return [header, ...rows];
}

export default async function handler(req, res) {
  // Set CORS headers FIRST - allow chrome-extension origins
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests - MUST return after setting headers
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify license token (this is the real security check)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }

  try {
    console.log('[Supabase API] Fetching admins and tokens from Supabase...');

    // Fetch admins from Supabase
    const { data: adminsData, error: adminsError } = await supabase
      .from('admins')
      .select('*')
      .order('admin_username', { ascending: true });

    if (adminsError) {
      console.error('[Supabase API] Admins fetch error:', adminsError);
      throw adminsError;
    }

    // Fetch tokens from Supabase
    const { data: tokensData, error: tokensError } = await supabase
      .from('tokens')
      .select('*')
      .order('admin_username', { ascending: true });

    if (tokensError) {
      console.error('[Supabase API] Tokens fetch error:', tokensError);
      throw tokensError;
    }

    console.log('[Supabase API] Fetched', adminsData?.length || 0, 'admins and', tokensData?.length || 0, 'tokens');

    // Transform admins to Sheets format
    const admins = transformAdminsToSheetsFormat(adminsData || []);

    // Transform tokens to Sheets format
    const allTokens = transformTokensToSheetsFormat(tokensData || []);

    // Split tokens into regular (score 0-5) and failed (score 6)
    const tokens = [];
    const failedTokens = [];

    // Start from index 1 to skip header
    for (let i = 1; i < allTokens.length; i++) {
      const row = allTokens[i];
      const score = parseInt(row[8]) || 0; // Column I (index 8) - token_score

      if (score >= 6) {
        failedTokens.push(row);
      } else {
        tokens.push(row);
      }
    }

    // Add headers to regular tokens and failed tokens
    const tokenHeader = allTokens[0];
    const tokensWithHeader = [tokenHeader, ...tokens];
    const failedTokensWithHeader = failedTokens.length > 0 ? [tokenHeader, ...failedTokens] : [tokenHeader];

    console.log('[Supabase API] Returning data:', {
      admins: admins.length,
      tokens: tokensWithHeader.length,
      failedTokens: failedTokensWithHeader.length
    });

    res.json({
      success: true,
      admins: admins,
      tokens: tokensWithHeader,
      failedTokens: failedTokensWithHeader,
      comments: [],  // Empty - comments removed
      dailyStats: []  // Empty - daily stats removed
    });

  } catch (error) {
    console.error('[Supabase API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
