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
}

interface TrackFailure {
  track: TrackSearchResult;
  error: string;
  errorType: string;
}

interface PlaylistCreationResult {
  youtube_playlist: any;
  tracks_added: TrackSearchResult[];
  tracks_failed: TrackFailure[];
  creation_stats: {
    quota_used: number;
    creation_time: string;
    success_rate: number;
    failure_breakdown: { [errorType: string]: number };
  };
}

/**
 * Load search progress from JSON file
 */
function loadSearchProgress(playlistId: string): SearchProgress {
  const dataDir = path.join(process.cwd(), 'data');
  const progressFile = path.join(dataDir, `${playlistId}-search-progress.json`);

  if (!fs.existsSync(progressFile)) {
    throw new Error(`Search progress file not found: ${progressFile}\nPlease run Phase 1 (search-tracks) first.`);
  }

  console.log(`📂 Loading search results from: ${progressFile}`);
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  
  // Validate the progress file
  if (!progress.tracks || progress.tracks.length === 0) {
    throw new Error('No tracks found in search progress file. Please run Phase 1 first.');
  }

  return progress;
}

/**
 * Save playlist creation results
 */
function savePlaylistResult(playlistId: string, progress: SearchProgress, result: PlaylistCreationResult): void {
  const dataDir = path.join(process.cwd(), 'data');
  const resultFile = path.join(dataDir, `${playlistId}-playlist-result.json`);
  
  const finalResult = {
    ...progress,
    playlist_creation: result,
    completion_date: new Date().toISOString(),
  };
  
  fs.writeFileSync(resultFile, JSON.stringify(finalResult, null, 2));
  console.log(`💾 Final results saved to: ${resultFile}`);
}

/**
 * Create YouTube playlist and add all found tracks
 */
async function createPlaylistFromResults(
  youtubeService: YouTubeService,
  oauthService: OAuthService,
  progress: SearchProgress
): Promise<PlaylistCreationResult> {
  
  // Filter tracks that have YouTube matches
  const tracksWithMatches = progress.tracks.filter(track => track.youtube_video !== null);
  const tracksWithoutMatches = progress.tracks.filter(track => track.youtube_video === null);
  
  console.log(`\n📊 Search Results Summary:`);
  console.log(`   Total tracks searched: ${progress.tracks.length}`);
  console.log(`   Tracks with YouTube matches: ${tracksWithMatches.length}`);
  console.log(`   Tracks without matches: ${tracksWithoutMatches.length}`);
  console.log(`   Success rate: ${((tracksWithMatches.length / progress.tracks.length) * 100).toFixed(1)}%`);
  
  if (tracksWithMatches.length === 0) {
    throw new Error('No tracks with YouTube matches found. Cannot create empty playlist.');
  }
  
  // Estimate quota cost for playlist creation
  const playlistCreationCost = 50;
  const videosAddCost = tracksWithMatches.length * 50;
  const totalEstimatedCost = playlistCreationCost + videosAddCost;
  
  console.log(`\n💰 Estimated quota cost for playlist creation:`);
  console.log(`   Create playlist: ${playlistCreationCost} units`);
  console.log(`   Add ${tracksWithMatches.length} videos: ${videosAddCost} units`);
  console.log(`   Total estimated: ${totalEstimatedCost} units`);
  
  if (totalEstimatedCost > 10000) {
    console.warn('⚠️ Warning: Estimated quota cost exceeds daily limit of 10,000 units');
    console.log('You may need to split the playlist or request quota increase');
  }
  
  // Get OAuth access token
  const accessToken = await oauthService.getAccessToken();
  
  // Create YouTube playlist
  console.log('\n📝 Creating YouTube playlist...');
  const playlistName = process.env.YOUTUBE_PLAYLIST_NAME || `${progress.spotify_playlist.name} (from Spotify)`;
  const playlistDescription = `Converted from Spotify playlist "${progress.spotify_playlist.name}"\n\nOriginal playlist: ${progress.spotify_playlist.url}\n\nSearch completed: ${progress.progress.tracks_processed} tracks processed\nMatches found: ${tracksWithMatches.length}/${progress.tracks.length} tracks\nSuccess rate: ${((tracksWithMatches.length / progress.tracks.length) * 100).toFixed(1)}%\n\nConverted using Spotify to YouTube Converter - Phase System`;
  
  const youtubePlaylist = await youtubeService.createPlaylist(
    playlistName,
    playlistDescription,
    accessToken
  );
  
  console.log(`✅ Created YouTube playlist: "${youtubePlaylist.snippet.title}"`);
  console.log(`🔗 Playlist ID: ${youtubePlaylist.id}`);
  
  // Add videos to playlist
  console.log('\n➕ Adding videos to YouTube playlist...');
  const tracksAdded: TrackSearchResult[] = [];
  const tracksFailed: TrackFailure[] = [];
  const failureBreakdown: { [errorType: string]: number } = {};
  let quotaUsed = playlistCreationCost;
  
  for (let i = 0; i < tracksWithMatches.length; i++) {
    const trackResult = tracksWithMatches[i];
    const track = trackResult.spotify_track;
    const video = trackResult.youtube_video;
    const artists = track.artists.map((a: any) => a.name).join(', ');
    
    console.log(`\n${i + 1}/${tracksWithMatches.length} Adding: "${track.name}" by ${artists}`);
    console.log(`   YouTube match: "${video.snippet.title}" (${(trackResult.confidence * 100).toFixed(1)}% confidence)`);
    console.log(`   Video ID: ${video.id.videoId}`);
    
    try {
      const result = await youtubeService.addVideoToPlaylist(
        youtubePlaylist.id,
        video.id.videoId,
        accessToken
      );
      
      if (result.success) {
        tracksAdded.push(trackResult);
        quotaUsed += 50;
        console.log(`   ✅ Added successfully`);
      } else {
        const failure: TrackFailure = {
          track: trackResult,
          error: result.error || 'Unknown error',
          errorType: result.errorType || 'UNKNOWN'
        };
        tracksFailed.push(failure);
        
        // Count error types
        failureBreakdown[failure.errorType] = (failureBreakdown[failure.errorType] || 0) + 1;
        
        console.log(`   ❌ Failed: ${failure.error} (${failure.errorType})`);
      }
    } catch (error) {
      const failure: TrackFailure = {
        track: trackResult,
        error: `Unexpected error: ${error}`,
        errorType: 'UNEXPECTED_ERROR'
      };
      tracksFailed.push(failure);
      failureBreakdown[failure.errorType] = (failureBreakdown[failure.errorType] || 0) + 1;
      console.log(`   ❌ Unexpected error: ${error}`);
    }
    
    // Rate limiting: wait between API calls
    if (i < tracksWithMatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n✅ Playlist creation completed!`);
  console.log(`   Videos successfully added: ${tracksAdded.length}`);
  console.log(`   Videos failed to add: ${tracksFailed.length}`);
  console.log(`   Actual quota used: ~${quotaUsed} units`);
  
  // Display failure breakdown
  if (tracksFailed.length > 0) {
    console.log(`\n📊 Failure Breakdown:`);
    Object.entries(failureBreakdown).forEach(([errorType, count]) => {
      console.log(`   ${errorType}: ${count} videos`);
    });
  }
  
  return {
    youtube_playlist: youtubePlaylist,
    tracks_added: tracksAdded,
    tracks_failed: tracksFailed,
    creation_stats: {
      quota_used: quotaUsed,
      creation_time: new Date().toISOString(),
      success_rate: tracksAdded.length / tracksWithMatches.length,
      failure_breakdown: failureBreakdown,
    },
  };
}

/**
 * Main function for Phase 2: Create playlist
 */
async function main(): Promise<void> {
  console.log('🎬 YouTube Playlist Creation (Phase 2)');
  console.log('======================================');
  
  try {
    // Load and validate configuration
    const config = loadAppConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Initialize services (YouTube and OAuth needed for playlist creation)
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
      console.error('Usage: npm run create-playlist <playlist_id_or_url> [authorization_code]');
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
    
    // Load search progress
    const progress = loadSearchProgress(playlistId);
    
    console.log(`\n📊 Loaded Search Results:`);
    console.log(`   Playlist: "${progress.spotify_playlist.name}"`);
    console.log(`   Total tracks: ${progress.spotify_playlist.total_tracks}`);
    console.log(`   Tracks processed: ${progress.progress.tracks_processed}`);
    console.log(`   Tracks found: ${progress.progress.tracks_found}`);
    console.log(`   Search quota used: ${progress.search_stats.total_quota_used} units`);
    
    // Check if search is complete
    if (progress.progress.tracks_processed < progress.spotify_playlist.total_tracks) {
      const remaining = progress.spotify_playlist.total_tracks - progress.progress.tracks_processed;
      console.warn(`\n⚠️ Warning: Search is not complete!`);
      console.warn(`   ${remaining} tracks still need to be searched`);
      console.warn(`   Consider running Phase 1 again to complete the search`);
      console.warn(`   Or proceed with current results (${progress.progress.tracks_processed} tracks)`);
      
      // Ask user to confirm
      console.log(`\nDo you want to proceed with incomplete results? (Continue in 10 seconds...)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
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
    
    // Create playlist from search results
    console.log('\n🚀 Starting playlist creation...');
    const result = await createPlaylistFromResults(youtubeService, oauthService, progress);
    
    // Save final results
    savePlaylistResult(playlistId, progress, result);
    
    // Display final summary
    console.log('\n🎉 PLAYLIST CREATION COMPLETE! 🎉');
    console.log('==================================');
    console.log(`📊 Final Results:`);
    console.log(`   Original Spotify Playlist: "${progress.spotify_playlist.name}" (${progress.spotify_playlist.total_tracks} tracks)`);
    console.log(`   Created YouTube Playlist: "${result.youtube_playlist.snippet.title}"`);
    console.log(`   Tracks successfully added: ${result.tracks_added.length}`);
    console.log(`   Tracks failed to add: ${result.tracks_failed.length}`);
    console.log(`   Overall success rate: ${(result.creation_stats.success_rate * 100).toFixed(1)}%`);
    console.log(`   Total quota used (Phase 1 + 2): ${progress.search_stats.total_quota_used + result.creation_stats.quota_used} units`);
    
    if (result.tracks_failed.length > 0) {
      console.log('\n⚠️ Tracks that failed to be added to playlist:');
      result.tracks_failed.forEach((trackFailure, index) => {
        const track = trackFailure.track.spotify_track;
        const artists = track.artists.map((a: any) => a.name).join(', ');
        console.log(`   ${index + 1}. "${track.name}" by ${artists} - ${trackFailure.errorType}: ${trackFailure.error}`);
      });
    }
    
    console.log(`\n🔗 Your new YouTube playlist: https://www.youtube.com/playlist?list=${result.youtube_playlist.id}`);
    console.log(`📁 Complete results saved in: data/${playlistId}-playlist-result.json`);
    console.log('\n✨ Enjoy your music on YouTube! ✨');
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('OAuth flow initiated')) {
      // This is expected when starting OAuth flow
      return;
    }
    
    logWithTimestamp(`Playlist creation error: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the playlist creation application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 