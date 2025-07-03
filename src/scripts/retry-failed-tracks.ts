import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { YouTubeService } from '../services/youtubeService';
import { OAuthService } from '../services/oauthService';
import { loadAppConfig, extractSpotifyPlaylistId, logWithTimestamp } from '../utils';

// Load environment variables
dotenv.config();

interface TrackSearchResult {
  spotify_track: any;
  youtube_video: any;
  confidence: number;
  search_date: string;
  search_queries_tried: string[];
}

interface TrackFailure {
  track: TrackSearchResult;
  error: string;
  errorType: string;
}

interface PlaylistCreationResult {
  youtube_playlist: any;
  tracks_added: TrackSearchResult[];
  tracks_failed: TrackSearchResult[]; // These are actually TrackSearchResult objects, not TrackFailure
  creation_stats: {
    quota_used: number;
    creation_time: string;
    success_rate: number;
    failure_breakdown: { [errorType: string]: number };
  };
}

interface SearchProgress {
  spotify_playlist: {
    id: string;
    name: string;
    total_tracks: number;
    url: string;
  };
  tracks: TrackSearchResult[];
  progress: {
    tracks_processed: number;
    tracks_found: number;
    tracks_not_found: number;
    last_updated: string;
    batch_size: number;
    current_batch_start: number;
  };
  search_stats: {
    total_quota_used: number;
    searches_performed: number;
    start_time: string;
    last_session_time?: string;
  };
  playlist_creation?: PlaylistCreationResult;
  completion_date?: string;
}

/**
 * Load playlist result from JSON file
 */
function loadPlaylistResult(playlistId: string): { progress: SearchProgress; result: PlaylistCreationResult } {
  const dataDir = path.join(process.cwd(), 'data');
  const resultFile = path.join(dataDir, `${playlistId}-playlist-result.json`);

  if (!fs.existsSync(resultFile)) {
    throw new Error(`Playlist result file not found: ${resultFile}\nPlease run Phase 2 (create-playlist) first.`);
  }

  console.log(`📂 Loading playlist results from: ${resultFile}`);
  const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  
  // Debug: Log the structure of the data
  console.log('🔍 File structure keys:', Object.keys(data));
  
  // Check if playlist_creation exists
  if (data.playlist_creation) {
    console.log('🔍 playlist_creation keys:', Object.keys(data.playlist_creation));
    if (!data.playlist_creation.tracks_failed) {
      throw new Error('No failed tracks found in playlist_creation.tracks_failed.');
    }
    return {
      progress: data,
      result: data.playlist_creation
    };
  }
  
  // Check if tracks_added and tracks_failed exist at root level
  if (data.tracks_added && data.tracks_failed) {
    console.log('🔍 Found tracks_added and tracks_failed at root level');
    const result: PlaylistCreationResult = {
      youtube_playlist: data.youtube_playlist,
      tracks_added: data.tracks_added,
      tracks_failed: data.tracks_failed,
      creation_stats: data.creation_stats
    };
    return {
      progress: data,
      result: result
    };
  }
  
  // If neither structure is found, show what we have
  console.log('❌ Expected structure not found. Available keys:', Object.keys(data));
  throw new Error('Playlist result file does not contain expected tracks_added/tracks_failed structure.');
}

/**
 * Save updated playlist result
 */
function saveUpdatedResult(playlistId: string, progress: SearchProgress, updatedResult: PlaylistCreationResult): void {
  const dataDir = path.join(process.cwd(), 'data');
  const resultFile = path.join(dataDir, `${playlistId}-playlist-result.json`);
  
  // Update the playlist creation result
  progress.playlist_creation = updatedResult;
  progress.completion_date = new Date().toISOString();
  
  fs.writeFileSync(resultFile, JSON.stringify(progress, null, 2));
  console.log(`💾 Updated results saved to: ${resultFile}`);
}

/**
 * Retry adding failed tracks to existing playlist
 */
async function retryFailedTracks(
  youtubeService: YouTubeService,
  oauthService: OAuthService,
  playlistId: string,
  failedTracks: TrackSearchResult[]
): Promise<{ newlyAdded: TrackSearchResult[]; stillFailed: TrackSearchResult[]; quotaUsed: number }> {
  
  console.log(`\n🔄 Retrying ${failedTracks.length} failed tracks...`);
  
  // Get OAuth access token
  const accessToken = await oauthService.getAccessToken();
  
  const newlyAdded: TrackSearchResult[] = [];
  const stillFailed: TrackSearchResult[] = [];
  let quotaUsed = 0;
  
  for (let i = 0; i < failedTracks.length; i++) {
    const trackResult = failedTracks[i];
    const track = trackResult.spotify_track;
    const video = trackResult.youtube_video;
    const artists = track.artists.map((a: any) => a.name).join(', ');
    
    console.log(`\n${i + 1}/${failedTracks.length} Retrying: "${track.name}" by ${artists}`);
    console.log(`   YouTube match: "${video.snippet.title}"`);
    console.log(`   Video ID: ${video.id.videoId}`);
    console.log(`   Confidence: ${(trackResult.confidence * 100).toFixed(1)}%`);
    
    try {
      const result = await youtubeService.addVideoToPlaylist(
        playlistId,
        video.id.videoId,
        accessToken
      );
      
      if (result.success) {
        newlyAdded.push(trackResult);
        quotaUsed += 50;
        console.log(`   ✅ Successfully added this time!`);
      } else {
        stillFailed.push(trackResult);
        console.log(`   ❌ Still failed: ${result.error} (${result.errorType})`);
      }
    } catch (error) {
      stillFailed.push(trackResult);
      console.log(`   ❌ Unexpected error: ${error}`);
    }
    
    // Rate limiting: wait between API calls
    if (i < failedTracks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return { newlyAdded, stillFailed, quotaUsed };
}

/**
 * Main function for retrying failed tracks
 */
async function main(): Promise<void> {
  console.log('🔄 YouTube Playlist - Retry Failed Tracks');
  console.log('==========================================');
  
  try {
    // Load and validate configuration
    const config = loadAppConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Initialize services
    const youtubeService = new YouTubeService(
      config.youtube.apiKey,
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
    
    const oauthService = new OAuthService(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
    
    console.log('🔧 Services initialized');
    
    // Parse command line arguments
    const playlistInput = process.env.SPOTIFY_PLAYLIST_ID || process.argv[2];
    const authorizationCode = process.argv[3];
    
    if (!playlistInput) {
      console.error('❌ No Spotify playlist ID provided.');
      console.error('Usage: npm run retry-failed <playlist_id_or_url> [authorization_code]');
      console.error('Or set SPOTIFY_PLAYLIST_ID in your .env file');
      process.exit(1);
    }
    
    // Test YouTube connection
    console.log('\n🔍 Testing YouTube API connection...');
    const youtubeOk = await youtubeService.testConnection();
    
    if (!youtubeOk) {
      console.error('❌ YouTube API connection test failed. Please check your credentials.');
      process.exit(1);
    }
    
    console.log('✅ YouTube API connection successful!\n');
    
    // Extract playlist ID from input
    let playlistId: string;
    try {
      playlistId = extractSpotifyPlaylistId(playlistInput);
      console.log(`📋 Processing playlist ID: ${playlistId}`);
    } catch (error) {
      console.error('❌ Invalid playlist ID or URL:', error);
      process.exit(1);
    }
    
    // Load existing playlist result
    const { progress, result } = loadPlaylistResult(playlistId);
    
    console.log(`\n📊 Loaded Previous Results:`);
    console.log(`   Playlist: "${progress.spotify_playlist.name}"`);
    console.log(`   YouTube Playlist: "${result.youtube_playlist.snippet.title}"`);
    console.log(`   Previously added: ${result.tracks_added.length} tracks`);
    console.log(`   Previously failed: ${result.tracks_failed.length} tracks`);
    console.log(`   Previous success rate: ${(result.creation_stats.success_rate * 100).toFixed(1)}%`);
    
    // Debug: Check the structure of failed tracks
    if (result.tracks_failed.length > 0) {
      console.log('\n🔍 Debug: Checking first failed track structure...');
      const firstFailure = result.tracks_failed[0];
      console.log('First failure keys:', Object.keys(firstFailure));
      
      // The failed tracks are stored as TrackSearchResult objects directly
      // not as TrackFailure objects with track/error/errorType properties
      if (firstFailure.spotify_track && firstFailure.youtube_video) {
        console.log('✅ Found TrackSearchResult structure (spotify_track + youtube_video)');
      } else {
        console.log('❌ Unexpected structure in failed tracks');
        console.log('First failure structure:', JSON.stringify(firstFailure, null, 2));
      }
    }
    
    if (result.tracks_failed.length === 0) {
      console.log('\n✅ No failed tracks to retry!');
      return;
    }
    
    // Estimate quota cost for retry
    const estimatedCost = result.tracks_failed.length * 50;
    console.log(`\n💰 Estimated quota cost for retry: ${estimatedCost} units`);
    
    if (estimatedCost > 10000) {
      console.warn('⚠️ Warning: Estimated quota cost exceeds daily limit of 10,000 units');
      console.log('Consider retrying in smaller batches');
    }
    
    // Handle OAuth flow
    if (authorizationCode) {
      console.log('🔐 Processing OAuth authorization code...');
      await oauthService.exchangeCodeForToken(authorizationCode);
    } else if (!oauthService.hasValidToken()) {
      console.log('⚠️ No valid OAuth token found. Starting OAuth flow...');
      await oauthService.startOAuthFlow();
      return; // Exit here, user needs to restart with auth code
    }
    
    // Retry failed tracks
    console.log('\n🚀 Starting retry of failed tracks...');
    const retryResult = await retryFailedTracks(
      youtubeService, 
      oauthService, 
      result.youtube_playlist.id, 
      result.tracks_failed
    );
    
    // Update the result
    const updatedResult: PlaylistCreationResult = {
      youtube_playlist: result.youtube_playlist,
      tracks_added: [...result.tracks_added, ...retryResult.newlyAdded],
      tracks_failed: retryResult.stillFailed,
      creation_stats: {
        quota_used: result.creation_stats.quota_used + retryResult.quotaUsed,
        creation_time: new Date().toISOString(),
        success_rate: (result.tracks_added.length + retryResult.newlyAdded.length) / 
                     (result.tracks_added.length + result.tracks_failed.length),
        failure_breakdown: {} // Could be enhanced to track failure types
      }
    };
    
    // Save updated results
    saveUpdatedResult(playlistId, progress, updatedResult);
    
    // Display final summary
    console.log('\n🎉 RETRY COMPLETE! 🎉');
    console.log('=====================');
    console.log(`📊 Retry Results:`);
    console.log(`   YouTube Playlist: "${result.youtube_playlist.snippet.title}"`);
    console.log(`   Newly added: ${retryResult.newlyAdded.length} tracks`);
    console.log(`   Still failed: ${retryResult.stillFailed.length} tracks`);
    console.log(`   Quota used for retry: ${retryResult.quotaUsed} units`);
    console.log(`   Updated success rate: ${(updatedResult.creation_stats.success_rate * 100).toFixed(1)}%`);
    
    if (retryResult.newlyAdded.length > 0) {
      console.log('\n✅ Successfully added this time:');
      retryResult.newlyAdded.forEach((track, index) => {
        const trackInfo = track.spotify_track;
        const artists = trackInfo.artists.map((a: any) => a.name).join(', ');
        console.log(`   ${index + 1}. "${trackInfo.name}" by ${artists}`);
      });
    }
    
    if (retryResult.stillFailed.length > 0) {
      console.log('\n❌ Still failed to add:');
      retryResult.stillFailed.forEach((trackResult, index) => {
        const track = trackResult.spotify_track;
        const artists = track.artists.map((a: any) => a.name).join(', ');
        console.log(`   ${index + 1}. "${track.name}" by ${artists}`);
      });
    }
    
    console.log(`\n🔗 Your YouTube playlist: https://www.youtube.com/playlist?list=${result.youtube_playlist.id}`);
    console.log(`📁 Updated results saved in: data/${playlistId}-playlist-result.json`);
    
    if (retryResult.stillFailed.length > 0) {
      console.log('\n💡 Tip: Some videos may have permanent restrictions that prevent playlist addition.');
      console.log('   You can manually add these videos to your playlist on YouTube.');
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('OAuth flow initiated')) {
      // This is expected when starting OAuth flow
      return;
    }
    
    logWithTimestamp(`Retry failed tracks error: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the retry application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 