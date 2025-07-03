import axios, { AxiosInstance } from 'axios';
import { 
  YouTubeVideo, 
  YouTubeSearchResponse, 
  YouTubePlaylistResponse,
  SpotifyTrack,
  TrackMapping,
  ApiError 
} from '../types';

/**
 * YouTube Data API v3 Service
 * Handles video search and playlist operations
 */
export class YouTubeService {
  private axiosInstance: AxiosInstance;

  constructor(
    private apiKey: string,
    private googleClientId?: string,
    private googleClientSecret?: string,
    private redirectUri?: string
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://www.googleapis.com/youtube/v3',
      timeout: 15000,
      params: {
        key: this.apiKey,
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        throw this.createApiError(error);
      }
    );
  }

  /**
   * Search for videos using track information
   */
  async searchVideo(track: SpotifyTrack): Promise<YouTubeVideo | null> {
    try {
      const queries = this.generateSearchQueries(track);
      
      for (const query of queries) {
        console.log(`🔍 Searching YouTube for: "${query}"`);
        
        const videos = await this.searchVideos(query, 5);
        
        if (videos.length > 0) {
          // Find the best match using scoring algorithm
          const bestMatch = this.findBestMatch(track, videos);
          if (bestMatch) {
            console.log(`✅ Found match: "${bestMatch.snippet.title}"`);
            return bestMatch;
          }
        }

        // Rate limiting: wait 200ms between different query attempts
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log(`❌ No suitable match found for: ${track.name} by ${track.artists[0]?.name}`);
      return null;
    } catch (error) {
      console.error(`❌ Error searching for track: ${track.name}`, error);
      return null;
    }
  }

  /**
   * Search for videos with a specific query
   */
  async searchVideos(query: string, maxResults: number = 10): Promise<YouTubeVideo[]> {
    try {
      const response: any = await this.axiosInstance.get('/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults,
          order: 'relevance',
          videoCategoryId: '10', // Music category
        },
      });

      const searchResponse: YouTubeSearchResponse = response.data;
      return searchResponse.items || [];
    } catch (error) {
      console.error('❌ Failed to search YouTube videos:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Generate multiple search queries for better matching
   */
  private generateSearchQueries(track: SpotifyTrack): string[] {
    const trackName = track.name;
    const artistName = track.artists[0]?.name || '';
    
    // Clean track name (remove features, special characters)
    const cleanTrackName = this.cleanTrackName(trackName);
    
    const queries = [
      // Most specific queries first
      `${artistName} ${cleanTrackName} official`,
      `${artistName} ${cleanTrackName} official audio`,
      `${artistName} ${cleanTrackName} official video`,
      `${artistName} ${cleanTrackName}`,
      `${trackName} ${artistName}`,
      // Fallback queries
      `${cleanTrackName} ${artistName}`,
      `"${artistName}" "${cleanTrackName}"`,
    ];

    // Remove duplicates and empty queries
    return [...new Set(queries)].filter(q => q.trim().length > 0);
  }

  /**
   * Clean track name by removing common additions
   */
  private cleanTrackName(trackName: string): string {
    return trackName
      // Remove featured artists
      .replace(/\s*\(?(?:feat\.?|featuring|ft\.?)\s+[^)]*\)?/gi, '')
      // Remove remix information
      .replace(/\s*[-–]\s*.*(?:remix|mix|version|edit)\s*/gi, '')
      // Remove remaster information
      .replace(/\s*[-–]\s*.*(?:remaster|remastered)\s*/gi, '')
      // Remove year information
      .replace(/\s*\(?\d{4}\)?/g, '')
      // Remove extra parentheses content
      .replace(/\s*\([^)]*\)/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find the best matching video using a scoring algorithm
   */
  private findBestMatch(track: SpotifyTrack, videos: YouTubeVideo[]): YouTubeVideo | null {
    if (videos.length === 0) return null;

    const trackName = track.name.toLowerCase();
    const artistName = track.artists[0]?.name.toLowerCase() || '';

    let bestVideo: YouTubeVideo | null = null;
    let bestScore = 0;

    for (const video of videos) {
      const videoTitle = video.snippet.title.toLowerCase();
      const channelTitle = video.snippet.channelTitle.toLowerCase();
      
      let score = 0;

      // Title similarity scoring
      if (videoTitle.includes(trackName)) score += 3;
      if (videoTitle.includes(artistName)) score += 3;
      
      // Partial matches
      const trackWords = trackName.split(' ').filter(word => word.length > 2);
      const artistWords = artistName.split(' ').filter(word => word.length > 2);
      
      trackWords.forEach(word => {
        if (videoTitle.includes(word)) score += 1;
      });
      
      artistWords.forEach(word => {
        if (videoTitle.includes(word) || channelTitle.includes(word)) score += 1;
      });

      // Bonus for official content
      if (videoTitle.includes('official')) score += 2;
      if (channelTitle.includes(artistName)) score += 2;
      
      // Penalty for live versions, covers, etc.
      if (videoTitle.includes('live')) score -= 1;
      if (videoTitle.includes('cover')) score -= 2;
      if (videoTitle.includes('karaoke')) score -= 3;

      // Prefer videos from official/verified channels
      if (channelTitle.includes('official') || channelTitle.includes('records')) {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVideo = video;
      }
    }

    // Only return if score is reasonable (at least some match)
    return bestScore >= 2 ? bestVideo : null;
  }

  /**
   * Create a new YouTube playlist
   */
  async createPlaylist(
    title: string, 
    description: string = '',
    accessToken?: string
  ): Promise<YouTubePlaylistResponse> {
    try {
      console.log(`📝 Creating YouTube playlist: "${title}"`);
      
      if (!accessToken) {
        throw new Error('OAuth access token required for playlist creation');
      }

      const response: any = await axios.post(
        'https://www.googleapis.com/youtube/v3/playlists',
        {
          snippet: {
            title,
            description,
          },
          status: {
            privacyStatus: 'private', // Can be 'public', 'private', or 'unlisted'
          },
        },
        {
          params: {
            part: 'snippet,status',
            key: this.apiKey,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`✅ Created playlist with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create YouTube playlist:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Add a video to a playlist
   */
  async addVideoToPlaylist(
    playlistId: string, 
    videoId: string, 
    accessToken?: string
  ): Promise<{ success: boolean; error?: string; errorType?: string }> {
    try {
      if (!accessToken) {
        throw new Error('OAuth access token required for adding videos to playlist');
      }

      await axios.post(
        'https://www.googleapis.com/youtube/v3/playlistItems',
        {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
        {
          params: {
            part: 'snippet',
            key: this.apiKey,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error: any) {
      let errorType = 'UNKNOWN';
      let errorMessage = 'Unknown error';
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        switch (status) {
          case 403:
            if (data?.error?.errors?.[0]?.reason) {
              const reason = data.error.errors[0].reason;
              switch (reason) {
                case 'playlistItemsNotAccessible':
                  errorType = 'VIDEO_PRIVATE_OR_DELETED';
                  errorMessage = 'Video is private, deleted, or not accessible';
                  break;
                case 'videoNotFound':
                  errorType = 'VIDEO_NOT_FOUND';
                  errorMessage = 'Video not found or has been deleted';
                  break;
                case 'forbidden':
                  errorType = 'VIDEO_EMBEDDING_DISABLED';
                  errorMessage = 'Video owner has disabled adding to playlists';
                  break;
                case 'quotaExceeded':
                  errorType = 'QUOTA_EXCEEDED';
                  errorMessage = 'Daily API quota exceeded';
                  break;
                default:
                  errorType = 'FORBIDDEN_OTHER';
                  errorMessage = `Forbidden: ${reason}`;
              }
            } else {
              errorType = 'FORBIDDEN_GENERIC';
              errorMessage = 'Access forbidden - video may be restricted';
            }
            break;
          case 404:
            errorType = 'VIDEO_NOT_FOUND';
            errorMessage = 'Video not found or has been deleted';
            break;
          case 400:
            errorType = 'BAD_REQUEST';
            errorMessage = 'Invalid request parameters';
            break;
          default:
            errorType = 'HTTP_ERROR';
            errorMessage = `HTTP ${status}: ${data?.error?.message || 'Unknown error'}`;
        }
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorType = 'NETWORK_ERROR';
        errorMessage = 'Network connection error';
      } else {
        errorMessage = error.message || 'Unknown error occurred';
      }

      console.error(`❌ Failed to add video ${videoId}: ${errorMessage} (${errorType})`);
      return { success: false, error: errorMessage, errorType };
    }
  }

  /**
   * Process multiple tracks and find YouTube matches
   */
  async findMatchesForTracks(tracks: SpotifyTrack[]): Promise<TrackMapping[]> {
    console.log(`🔍 Finding YouTube matches for ${tracks.length} tracks...`);
    
    const mappings: TrackMapping[] = [];
    const batchSize = 3; // Process in small batches to respect rate limits

    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (track, index) => {
        // Stagger requests to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, index * 300));
        
        const youtubeVideo = await this.searchVideo(track);
        if (youtubeVideo) {
          return {
            spotifyTrack: track,
            youtubeVideo,
            confidence: this.calculateConfidence(track, youtubeVideo),
          };
        }
        return null;
      });

      const batchResults = await Promise.all(batchPromises);
      const validMappings = batchResults.filter((mapping): mapping is TrackMapping => mapping !== null);
      mappings.push(...validMappings);

      console.log(`📊 Progress: ${Math.min(i + batchSize, tracks.length)}/${tracks.length} tracks processed`);
    }

    console.log(`✅ Found ${mappings.length} matches out of ${tracks.length} tracks`);
    return mappings;
  }

  /**
   * Calculate confidence score for a track mapping
   */
  private calculateConfidence(track: SpotifyTrack, video: YouTubeVideo): number {
    const trackName = track.name.toLowerCase();
    const artistName = track.artists[0]?.name.toLowerCase() || '';
    const videoTitle = video.snippet.title.toLowerCase();
    const channelTitle = video.snippet.channelTitle.toLowerCase();

    let confidence = 0.5; // Base confidence

    // Exact matches
    if (videoTitle.includes(trackName)) confidence += 0.3;
    if (videoTitle.includes(artistName) || channelTitle.includes(artistName)) confidence += 0.2;
    
    // Official content bonus
    if (videoTitle.includes('official')) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Test the YouTube connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response: any = await this.axiosInstance.get('/search', {
        params: {
          part: 'snippet',
          q: 'test',
          type: 'video',
          maxResults: 1,
        },
      });

      console.log('✅ YouTube connection test successful');
      return true;
    } catch (error) {
      console.error('❌ YouTube connection test failed:', error);
      return false;
    }
  }

  /**
   * Create a standardized API error
   */
  private createApiError(error: any): ApiError {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Unknown YouTube API error';
    
    return {
      status,
      message: `YouTube API Error: ${message}`,
      service: 'youtube',
    };
  }
} 