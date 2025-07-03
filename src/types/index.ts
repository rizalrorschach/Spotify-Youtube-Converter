/**
 * TypeScript interfaces for Spotify and YouTube API responses
 */

// Spotify API Types
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  duration_ms: number;
  external_urls: {
    spotify: string;
  };
  preview_url?: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: {
    items: SpotifyPlaylistTrack[];
    total: number;
    next?: string;
  };
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyPlaylistTrack {
  track: SpotifyTrack;
  added_at: string;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// YouTube API Types
export interface YouTubeVideo {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default: YouTubeThumbnail;
      medium: YouTubeThumbnail;
      high: YouTubeThumbnail;
    };
  };
}

export interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface YouTubeSearchResponse {
  items: YouTubeVideo[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

export interface YouTubePlaylist {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
  };
}

export interface YouTubePlaylistResponse {
  id: string;
  snippet: {
    title: string;
    description: string;
  };
}

// Application Types
export interface ConversionResult {
  spotifyPlaylist: SpotifyPlaylist;
  youtubePlaylist: YouTubePlaylistResponse;
  convertedTracks: TrackMapping[];
  failedTracks: SpotifyTrack[];
}

export interface TrackMapping {
  spotifyTrack: SpotifyTrack;
  youtubeVideo: YouTubeVideo;
  confidence: number; // 0-1 score for match quality
}

// Configuration Types
export interface AppConfig {
  spotify: {
    clientId: string;
    clientSecret: string;
  };
  youtube: {
    apiKey: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

// Error Types
export interface ApiError {
  status: number;
  message: string;
  service: 'spotify' | 'youtube';
} 