import axios, { AxiosInstance } from 'axios';
import { SpotifyTokenResponse, SpotifyPlaylist, SpotifyTrack, ApiError } from '../types';

/**
 * Spotify Web API Service
 * Handles authentication and playlist operations
 */
export class SpotifyService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private axiosInstance: AxiosInstance;

  constructor(
    private clientId: string,
    private clientSecret: string
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: 10000,
    });

    // Add request interceptor to include auth token
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.accessToken = null; // Force token refresh on next request
        }
        throw this.createApiError(error);
      }
    );
  }

  /**
   * Authenticate with Spotify using Client Credentials flow
   */
  private async authenticate(): Promise<SpotifyTokenResponse> {
    try {
      console.log('🔐 Authenticating with Spotify...');
      
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      console.log('✅ Spotify authentication successful');
      return response.data;
    } catch (error) {
      console.error('❌ Spotify authentication failed:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    
    if (!this.accessToken || now >= this.tokenExpiry) {
      const tokenResponse = await this.authenticate();
      this.accessToken = tokenResponse.access_token;
      // Set expiry 5 minutes before actual expiry for safety
      this.tokenExpiry = now + (tokenResponse.expires_in - 300) * 1000;
    }
  }

  /**
   * Get a playlist by ID
   */
  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    try {
      console.log(`🎵 Fetching Spotify playlist: ${playlistId}`);
      
      const response = await this.axiosInstance.get(`/playlists/${playlistId}`);
      const playlist = response.data;

      console.log(`✅ Retrieved playlist: "${playlist.name}" (${playlist.tracks.total} tracks)`);
      return playlist;
    } catch (error) {
      console.error('❌ Failed to fetch playlist:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Get tracks from a playlist (handles pagination, limited to 50 tracks for quota management)
   */
  async getPlaylistTracks(playlistId: string, maxTracks: number = 50): Promise<SpotifyTrack[]> {
    try {
      console.log(`🎵 Fetching up to ${maxTracks} tracks from playlist: ${playlistId}`);
      
      let tracks: SpotifyTrack[] = [];
      let nextUrl: string | null = `/playlists/${playlistId}/tracks?limit=50`;

      while (nextUrl && tracks.length < maxTracks) {
        const response: any = await this.axiosInstance.get(nextUrl);
        const data: any = response.data;

        // Extract tracks and filter out null tracks
        const validTracks = data.items
          .filter((item: any) => item.track && item.track.id)
          .map((item: any) => item.track);

        // Add tracks but don't exceed the limit
        const remainingSlots = maxTracks - tracks.length;
        const tracksToAdd = validTracks.slice(0, remainingSlots);
        tracks.push(...tracksToAdd);

        // Check if we've reached the limit or if there are more pages
        if (tracks.length >= maxTracks) {
          console.log(`🎯 Reached track limit of ${maxTracks} tracks`);
          break;
        }

        if (data.next) {
          const nextUrlObj = new URL(data.next);
          // Remove the /v1 part since our axios instance already has it in baseURL
          nextUrl = nextUrlObj.pathname.replace('/v1', '') + nextUrlObj.search;
        } else {
          nextUrl = null;
        }
        
        if (nextUrl && tracks.length < maxTracks) {
          console.log(`📄 Loading next page... (${tracks.length} tracks loaded so far)`);
          // Rate limiting: wait 100ms between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Retrieved ${tracks.length} tracks from playlist (limited to ${maxTracks} tracks for quota management)`);
      return tracks;
    } catch (error) {
      console.error('❌ Failed to fetch playlist tracks:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Search for tracks by name and artist
   */
  async searchTracks(query: string, limit: number = 10): Promise<SpotifyTrack[]> {
    try {
      const response = await this.axiosInstance.get('/search', {
        params: {
          q: query,
          type: 'track',
          limit,
        },
      });

      return response.data.tracks.items;
    } catch (error) {
      console.error('❌ Failed to search tracks:', error);
      throw this.createApiError(error);
    }
  }

  /**
   * Create a standardized API error
   */
  private createApiError(error: any): ApiError {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Unknown Spotify API error';
    
    return {
      status,
      message: `Spotify API Error: ${message}`,
      service: 'spotify',
    };
  }

  /**
   * Test the Spotify connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      console.log('✅ Spotify connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Spotify connection test failed:', error);
      return false;
    }
  }
} 