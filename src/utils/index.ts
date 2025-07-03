import { AppConfig } from '../types';

/**
 * Utility functions for the Spotify to YouTube converter
 */

/**
 * Load and validate application configuration from environment variables
 */
export function loadAppConfig(): AppConfig {
  const requiredEnvVars = {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };

  // Check for missing required variables
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return {
    spotify: {
      clientId: requiredEnvVars.SPOTIFY_CLIENT_ID!,
      clientSecret: requiredEnvVars.SPOTIFY_CLIENT_SECRET!,
    },
    youtube: {
      apiKey: requiredEnvVars.YOUTUBE_API_KEY!,
    },
    google: {
      clientId: requiredEnvVars.GOOGLE_CLIENT_ID!,
      clientSecret: requiredEnvVars.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback',
    },
  };
}

/**
 * Extract Spotify playlist ID from various URL formats
 */
export function extractSpotifyPlaylistId(input: string): string {
  // Direct playlist ID
  if (/^[a-zA-Z0-9]{22}$/.test(input)) {
    return input;
  }

  // Spotify URL patterns
  const patterns = [
    /spotify:playlist:([a-zA-Z0-9]{22})/,
    /open\.spotify\.com\/playlist\/([a-zA-Z0-9]{22})/,
    /spotify\.com\/playlist\/([a-zA-Z0-9]{22})/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error(`Invalid Spotify playlist ID or URL: ${input}`);
}

/**
 * Format duration from milliseconds to human readable format
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate similarity between two strings (basic implementation)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Retry attempt ${attempt}/${maxRetries} in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Validate that a string is a valid YouTube video ID
 */
export function isValidYouTubeVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

/**
 * Create a safe filename from a string
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Log a message with timestamp
 */
export function logWithTimestamp(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📝',
    warn: '⚠️',
    error: '❌',
  }[level];

  console.log(`${prefix} [${timestamp}] ${message}`);
} 