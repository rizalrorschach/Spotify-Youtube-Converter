import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { SpotifyService } from '../services/spotifyService';
import { YouTubeService } from '../services/youtubeService';
import { loadAppConfig, extractSpotifyPlaylistId, logWithTimestamp } from '../utils';
import { SpotifyTrack, SpotifyPlaylist, YouTubeVideo } from '../types';

// Load environment variables
dotenv.config();

interface TrackSearchResult {
  spotify_track: SpotifyTrack;
  youtube_video: YouTubeVideo | null;
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

/**
 * Calculate match confidence between Spotify track and YouTube video
 */
function calculateMatchConfidence(track: SpotifyTrack, video: YouTubeVideo): number {
  const trackName = track.name.toLowerCase();
  const artistName = track.artists[0]?.name.toLowerCase() || '';
  const videoTitle = video.snippet.title.toLowerCase();
  const channelTitle = video.snippet.channelTitle.toLowerCase();

  let confidence = 0.5; // Base confidence

  // Title matching
  if (videoTitle.includes(trackName)) confidence += 0.3;
  if (videoTitle.includes(artistName) || channelTitle.includes(artistName)) confidence += 0.2;
  
  // Exact matches bonus
  if (videoTitle === `${artistName} ${trackName}` || 
      videoTitle === `${trackName} ${artistName}`) {
    confidence += 0.2;
  }
  
  // Official content bonus
  if (videoTitle.includes('official')) confidence += 0.1;
  if (channelTitle.includes(artistName)) confidence += 0.1;
  
  // Penalties for likely mismatches
  if (videoTitle.includes('cover') || videoTitle.includes('remix')) confidence -= 0.2;
  if (videoTitle.includes('live') || videoTitle.includes('concert')) confidence -= 0.1;
  if (videoTitle.includes('karaoke') || videoTitle.includes('instrumental')) confidence -= 0.3;
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Load existing progress or create new progress file
 */
function loadOrCreateProgress(playlistId: string, playlist: SpotifyPlaylist): SearchProgress {
  const dataDir = path.join(process.cwd(), 'data');
  const progressFile = path.join(dataDir, `${playlistId}-search-progress.json`);

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing progress or create new
  if (fs.existsSync(progressFile)) {
    console.log(`📂 Loading existing progress from: ${progressFile}`);
    const existing = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    existing.progress.last_updated = new Date().toISOString();
    existing.search_stats.last_session_time = new Date().toISOString();
    return existing;
  } else {
    console.log(`📝 Creating new progress file: ${progressFile}`);
    return {
      spotify_playlist: {
        id: playlist.id,
        name: playlist.name,
        total_tracks: playlist.tracks.total,
        url: playlist.external_urls.spotify,
      },
      tracks: [],
      progress: {
        tracks_processed: 0,
        tracks_found: 0,
        tracks_not_found: 0,
        last_updated: new Date().toISOString(),
        batch_size: parseInt(process.env.SEARCH_BATCH_SIZE || '50'),
        current_batch_start: 0,
      },
      search_stats: {
        total_quota_used: 0,
        searches_performed: 0,
        start_time: new Date().toISOString(),
      },
    };
  }
}

/**
 * Save progress to JSON file
 */
function saveProgress(playlistId: string, progress: SearchProgress): void {
  const dataDir = path.join(process.cwd(), 'data');
  const progressFile = path.join(dataDir, `${playlistId}-search-progress.json`);
  
  progress.progress.last_updated = new Date().toISOString();
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  console.log(`💾 Progress saved to: ${progressFile}`);
}

/**
 * Search for YouTube matches for a batch of tracks
 */
async function searchTrackBatch(
  youtubeService: YouTubeService,
  tracks: SpotifyTrack[],
  startIndex: number,
  batchSize: number,
  progress: SearchProgress
): Promise<void> {
  const endIndex = Math.min(startIndex + batchSize, tracks.length);
  const batch = tracks.slice(startIndex, endIndex);
  
  console.log(`\n🔍 Searching batch ${Math.floor(startIndex / batchSize) + 1}: tracks ${startIndex + 1}-${endIndex}`);
  console.log(`📊 Progress: ${progress.tracks.length}/${tracks.length} tracks processed so far`);
  
  for (let i = 0; i < batch.length; i++) {
    const track = batch[i];
    const globalIndex = startIndex + i;
    const artists = track.artists.map(a => a.name).join(', ');
    
    console.log(`\n${globalIndex + 1}/${tracks.length} Searching: "${track.name}" by ${artists}`);
    
    try {
      const youtubeVideo = await youtubeService.searchVideo(track);
      const confidence = youtubeVideo ? calculateMatchConfidence(track, youtubeVideo) : 0;
      
      const searchResult: TrackSearchResult = {
        spotify_track: track,
        youtube_video: youtubeVideo,
        confidence,
        search_date: new Date().toISOString(),
        search_queries_tried: [], // Could be enhanced to track actual queries
      };
      
      progress.tracks.push(searchResult);
      progress.progress.tracks_processed++;
      progress.search_stats.searches_performed++;
      progress.search_stats.total_quota_used += 100; // Each search costs 100 units
      
      if (youtubeVideo) {
        progress.progress.tracks_found++;
        console.log(`   ✅ Found: "${youtubeVideo.snippet.title}" (${(confidence * 100).toFixed(1)}% confidence)`);
      } else {
        progress.progress.tracks_not_found++;
        console.log(`   ❌ No suitable match found`);
      }
      
      // Save progress every 5 tracks
      if ((globalIndex + 1) % 5 === 0) {
        progress.progress.current_batch_start = globalIndex + 1;
        saveProgress(progress.spotify_playlist.id, progress);
      }
      
    } catch (error) {
      console.log(`   ❌ Error searching: ${error}`);
      progress.progress.tracks_processed++;
      progress.progress.tracks_not_found++;
      
      // Still add the track with no match
      progress.tracks.push({
        spotify_track: track,
        youtube_video: null,
        confidence: 0,
        search_date: new Date().toISOString(),
        search_queries_tried: [],
      });
    }
    
    // Rate limiting: wait between searches
    if (i < batch.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Update progress after batch completion
  progress.progress.current_batch_start = endIndex;
  saveProgress(progress.spotify_playlist.id, progress);
}

/**
 * Main function for Phase 1: Search tracks
 */
async function main(): Promise<void> {
  console.log('🔍 Spotify to YouTube Track Search (Phase 1)');
  console.log('=============================================');
  
  try {
    // Load and validate configuration
    const config = loadAppConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Initialize services (only Spotify and YouTube needed for searching)
    const spotifyService = new SpotifyService(
      config.spotify.clientId,
      config.spotify.clientSecret
    );
    
    const youtubeService = new YouTubeService(config.youtube.apiKey);
    
    console.log('🔧 Services initialized');
    
    // Parse command line arguments
    const playlistInput = process.env.SPOTIFY_PLAYLIST_ID || process.argv[2];
    const batchSize = parseInt(process.argv[3] || process.env.SEARCH_BATCH_SIZE || '50');
    
    if (!playlistInput) {
      console.error('❌ No Spotify playlist ID provided.');
      console.error('Usage: npm run search-tracks <playlist_id_or_url> [batch_size]');
      console.error('Or set SPOTIFY_PLAYLIST_ID in your .env file');
      process.exit(1);
    }
    
    // Test API connections
    console.log('\n🔍 Testing API connections...');
    const [spotifyOk, youtubeOk] = await Promise.all([
      spotifyService.testConnection(),
      youtubeService.testConnection()
    ]);
    
    if (!spotifyOk || !youtubeOk) {
      console.error('❌ API connection tests failed. Please check your credentials.');
      process.exit(1);
    }
    
    console.log('✅ All API connections successful!\n');
    
    // Extract playlist ID from input
    let playlistId: string;
    try {
      playlistId = extractSpotifyPlaylistId(playlistInput);
      console.log(`📋 Processing playlist ID: ${playlistId}`);
    } catch (error) {
      console.error('❌ Invalid playlist ID or URL:', error);
      process.exit(1);
    }
    
    // Get playlist info
    console.log('\n📥 Retrieving Spotify playlist...');
    const playlist = await spotifyService.getPlaylist(playlistId);
    
    console.log(`📊 Playlist Information:`);
    console.log(`   Name: "${playlist.name}"`);
    console.log(`   Description: ${playlist.description || 'No description'}`);
    console.log(`   Total tracks: ${playlist.tracks.total}`);
    console.log(`   URL: ${playlist.external_urls.spotify}`);
    
    // Load or create progress
    const progress = loadOrCreateProgress(playlistId, playlist);
    
    // Get all tracks from the playlist
    console.log('\n🎵 Retrieving all tracks from playlist...');
    const allTracks = await spotifyService.getPlaylistTracks(playlistId, playlist.tracks.total);
    
    if (allTracks.length === 0) {
      throw new Error('No tracks found in the playlist');
    }
    
    console.log(`✅ Retrieved ${allTracks.length} tracks`);
    
    // Show current progress
    console.log(`\n📈 Current Progress:`);
    console.log(`   Tracks processed: ${progress.progress.tracks_processed}/${allTracks.length}`);
    console.log(`   Tracks found: ${progress.progress.tracks_found}`);
    console.log(`   Tracks not found: ${progress.progress.tracks_not_found}`);
    console.log(`   Quota used so far: ${progress.search_stats.total_quota_used} units`);
    
    // Calculate remaining work
    const remainingTracks = allTracks.length - progress.progress.tracks_processed;
    if (remainingTracks === 0) {
      console.log('\n🎉 All tracks have been processed!');
      console.log(`📁 Results saved in: data/${playlistId}-search-progress.json`);
      console.log('🚀 Ready for Phase 2: Run "npm run create-playlist" to create YouTube playlist');
      return;
    }
    
    // Estimate quota cost for this session
    const tracksToProcess = Math.min(remainingTracks, batchSize);
    const estimatedQuotaCost = tracksToProcess * 100;
    console.log(`\n💰 This session will process ${tracksToProcess} tracks (~${estimatedQuotaCost} quota units)`);
    console.log(`📊 Remaining tracks after this session: ${remainingTracks - tracksToProcess}`);
    
    if (estimatedQuotaCost > 10000) {
      console.warn('⚠️ Warning: Estimated quota cost exceeds daily limit of 10,000 units');
      console.log('Consider reducing batch size or running over multiple days');
    }
    
    // Search for YouTube matches
    console.log('\n🚀 Starting track search...');
    await searchTrackBatch(
      youtubeService,
      allTracks,
      progress.progress.current_batch_start,
      batchSize,
      progress
    );
    
    // Final save and summary
    saveProgress(playlistId, progress);
    
    console.log('\n🎉 SEARCH SESSION COMPLETE! 🎉');
    console.log('================================');
    console.log(`📊 Session Results:`);
    console.log(`   Tracks processed this session: ${tracksToProcess}`);
    console.log(`   Total tracks processed: ${progress.progress.tracks_processed}/${allTracks.length}`);
    console.log(`   Total tracks found: ${progress.progress.tracks_found}`);
    console.log(`   Total tracks not found: ${progress.progress.tracks_not_found}`);
    console.log(`   Success rate: ${((progress.progress.tracks_found / progress.progress.tracks_processed) * 100).toFixed(1)}%`);
    console.log(`   Quota used this session: ~${tracksToProcess * 100} units`);
    console.log(`   Total quota used: ${progress.search_stats.total_quota_used} units`);
    
    const stillRemaining = allTracks.length - progress.progress.tracks_processed;
    if (stillRemaining > 0) {
      console.log(`\n⏳ Next Steps:`);
      console.log(`   ${stillRemaining} tracks remaining`);
      console.log(`   Run this script again tomorrow to continue`);
      console.log(`   Estimated quota needed: ~${stillRemaining * 100} units`);
    } else {
      console.log('\n🚀 Ready for Phase 2!');
      console.log('   All tracks have been searched');
      console.log('   Run "npm run create-playlist" to create YouTube playlist');
    }
    
    console.log(`\n📁 Progress saved in: data/${playlistId}-search-progress.json`);
    
  } catch (error) {
    logWithTimestamp(`Search error: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the search application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 