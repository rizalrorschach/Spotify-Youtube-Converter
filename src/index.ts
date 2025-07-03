import dotenv from 'dotenv';
import { SpotifyService } from './services/spotifyService';
import { YouTubeService } from './services/youtubeService';
import { OAuthService } from './services/oauthService';
import { loadAppConfig, extractSpotifyPlaylistId, logWithTimestamp } from './utils';
import { SpotifyTrack, ConversionResult, TrackMapping } from './types';

// Load environment variables
dotenv.config();

/**
 * Spotify to YouTube Playlist Converter
 * Main entry point for the application
 */
async function main(): Promise<void> {
  console.log('🎵 Spotify to YouTube Playlist Converter');
  console.log('========================================');
  
  try {
    // Load and validate configuration
    const config = loadAppConfig();
    console.log('✅ Configuration loaded successfully');
    
    // Initialize services
    const spotifyService = new SpotifyService(
      config.spotify.clientId,
      config.spotify.clientSecret
    );
    
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
      console.error('Usage: npm run dev <playlist_id_or_url> [authorization_code]');
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
    
    // Handle OAuth flow
    if (authorizationCode) {
      console.log('🔐 Processing OAuth authorization code...');
      await oauthService.exchangeCodeForToken(authorizationCode);
    } else if (!oauthService.hasValidToken()) {
      console.log('⚠️ No valid OAuth token found. Starting OAuth flow...');
      await oauthService.startOAuthFlow();
      return; // Exit here, user needs to restart with auth code
    }
    
    // Extract playlist ID from input
    let playlistId: string;
    try {
      playlistId = extractSpotifyPlaylistId(playlistInput);
      console.log(`📋 Processing playlist ID: ${playlistId}`);
    } catch (error) {
      console.error('❌ Invalid playlist ID or URL:', error);
      process.exit(1);
    }
    
    // Start the conversion process
    console.log('\n🚀 Starting playlist conversion...');
    const result = await convertPlaylist(spotifyService, youtubeService, oauthService, playlistId);
    
    // Display final results
    console.log('\n🎉 CONVERSION COMPLETE! 🎉');
    console.log('========================');
    console.log(`📊 Original Spotify Playlist: "${result.spotifyPlaylist.name}" (${result.spotifyPlaylist.tracks.total} total tracks)`);
    console.log(`🎬 Created YouTube Playlist: "${result.youtubePlaylist.snippet.title}"`);
    console.log(`✅ Successfully converted: ${result.convertedTracks.length} tracks`);
    console.log(`❌ Failed to convert: ${result.failedTracks.length} tracks`);
    console.log(`🎯 Success rate: ${((result.convertedTracks.length / (result.convertedTracks.length + result.failedTracks.length)) * 100).toFixed(1)}%`);
    const maxTracks = parseInt(process.env.MAX_TRACKS_TO_CONVERT || '50');
    console.log(`⚠️ Note: Limited to first ${maxTracks} tracks for YouTube API quota management`);
    
    if (result.failedTracks.length > 0) {
      console.log('\n⚠️ Tracks that could not be converted:');
      result.failedTracks.forEach((track, index) => {
        const artists = track.artists.map(a => a.name).join(', ');
        console.log(`   ${index + 1}. "${track.name}" by ${artists}`);
      });
    }
    
    console.log(`\n🔗 Your new YouTube playlist: https://www.youtube.com/playlist?list=${result.youtubePlaylist.id}`);
    console.log('\n✨ Enjoy your music on YouTube! ✨');
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('OAuth flow initiated')) {
      // This is expected when starting OAuth flow
      return;
    }
    
    logWithTimestamp(`Application error: ${error}`, 'error');
    process.exit(1);
  }
}

/**
 * Find YouTube matches for Spotify tracks
 */
async function findYouTubeMatches(
  youtubeService: YouTubeService, 
  tracks: SpotifyTrack[]
): Promise<TrackMapping[]> {
  console.log(`\n🔍 Finding YouTube matches for ${tracks.length} tracks...`);
  
  const mappings: TrackMapping[] = [];
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const artists = track.artists.map(a => a.name).join(', ');
    
    console.log(`\n${i + 1}/${tracks.length} Searching: "${track.name}" by ${artists}`);
    
    try {
      const youtubeVideo = await youtubeService.searchVideo(track);
      
      if (youtubeVideo) {
        const confidence = calculateMatchConfidence(track, youtubeVideo);
        mappings.push({
          spotifyTrack: track,
          youtubeVideo,
          confidence,
        });
        
        console.log(`   ✅ Found: "${youtubeVideo.snippet.title}" (${(confidence * 100).toFixed(1)}% confidence)`);
      } else {
        console.log(`   ❌ No suitable match found`);
      }
    } catch (error) {
      console.log(`   ❌ Error searching: ${error}`);
    }
    
    // Rate limiting: wait between searches
    if (i < tracks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return mappings;
}

/**
 * Calculate match confidence between Spotify track and YouTube video
 */
function calculateMatchConfidence(track: SpotifyTrack, video: any): number {
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
 * Convert a complete Spotify playlist to YouTube
 */
async function convertPlaylist(
  spotifyService: SpotifyService,
  youtubeService: YouTubeService,
  oauthService: OAuthService,
  playlistId: string
): Promise<ConversionResult> {
  
  // Step 1: Retrieve Spotify playlist
  console.log('\n📥 Step 1: Retrieving Spotify playlist...');
  const playlist = await spotifyService.getPlaylist(playlistId);
  
  console.log(`📊 Playlist Information:`);
  console.log(`   Name: "${playlist.name}"`);
  console.log(`   Description: ${playlist.description || 'No description'}`);
  console.log(`   Total tracks: ${playlist.tracks.total}`);
  console.log(`   URL: ${playlist.external_urls.spotify}`);
  
  // Get tracks from the playlist (limited for quota management)
  const maxTracks = parseInt(process.env.MAX_TRACKS_TO_CONVERT || '50');
  console.log(`\n🎵 Retrieving tracks (limited to ${maxTracks} for YouTube API quota management)...`);
  const tracks = await spotifyService.getPlaylistTracks(playlistId, maxTracks);
  
  if (tracks.length === 0) {
    throw new Error('No tracks found in the playlist');
  }
  
  console.log(`✅ Retrieved ${tracks.length} tracks`);
  
  // Display quota cost estimation
  const estimatedSearchCost = tracks.length * 100;
  const estimatedPlaylistCost = 50;
  const estimatedAddCost = Math.round(tracks.length * 0.8) * 50; // Assume 80% match rate
  const totalEstimatedCost = estimatedSearchCost + estimatedPlaylistCost + estimatedAddCost;
  console.log(`💰 Estimated YouTube API quota cost: ~${totalEstimatedCost} units (Daily limit: 10,000 units)`);
  
  // Step 2: Find YouTube matches
  console.log('\n🔍 Step 2: Finding YouTube matches...');
  const trackMappings = await findYouTubeMatches(youtubeService, tracks);
  
  const failedTracks = tracks.filter(track => 
    !trackMappings.some(mapping => mapping.spotifyTrack.id === track.id)
  );
  
  console.log(`✅ Found ${trackMappings.length} matches out of ${tracks.length} tracks`);
  
  // Step 3: Create YouTube playlist
  console.log('\n📝 Step 3: Creating YouTube playlist...');
  const accessToken = await oauthService.getAccessToken();
  
  const playlistName = process.env.YOUTUBE_PLAYLIST_NAME || `${playlist.name} (from Spotify)`;
  const playlistDescription = `Converted from Spotify playlist "${playlist.name}"\n\nOriginal playlist: ${playlist.external_urls.spotify}\n\nConverted ${trackMappings.length} out of ${tracks.length} tracks using Spotify to YouTube Converter.\n\nNote: Limited to first ${maxTracks} tracks for YouTube API quota management.`;
  
  const youtubePlaylist = await youtubeService.createPlaylist(
    playlistName,
    playlistDescription,
    accessToken
  );
  
  console.log(`✅ Created YouTube playlist: "${youtubePlaylist.snippet.title}"`);
  
  // Step 4: Add videos to playlist
  console.log('\n➕ Step 4: Adding videos to YouTube playlist...');
  let addedCount = 0;
  
  for (let i = 0; i < trackMappings.length; i++) {
    const mapping = trackMappings[i];
    const artists = mapping.spotifyTrack.artists.map(a => a.name).join(', ');
    
    console.log(`${i + 1}/${trackMappings.length} Adding: "${mapping.spotifyTrack.name}" by ${artists}`);
    
    try {
      const success = await youtubeService.addVideoToPlaylist(
        youtubePlaylist.id,
        mapping.youtubeVideo.id.videoId,
        accessToken
      );
      
      if (success) {
        addedCount++;
        console.log(`   ✅ Added successfully`);
      } else {
        console.log(`   ❌ Failed to add`);
      }
    } catch (error) {
      console.log(`   ❌ Error adding video: ${error}`);
    }
    
    // Rate limiting: wait between API calls
    if (i < trackMappings.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`✅ Added ${addedCount}/${trackMappings.length} videos to playlist`);
  
  return {
    spotifyPlaylist: playlist,
    youtubePlaylist,
    convertedTracks: trackMappings,
    failedTracks,
  };
}

// Run the application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});