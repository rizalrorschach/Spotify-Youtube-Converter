import axios from 'axios';
import { spawn } from 'child_process';

/**
 * OAuth Service for Google/YouTube Authentication
 * Handles the OAuth 2.0 flow for accessing YouTube API with user permissions
 */
export class OAuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string
  ) {}

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(authorizationCode: string): Promise<void> {
    try {
      console.log('🔄 Exchanging authorization code for access token...');

      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      });

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

      console.log('✅ Successfully obtained access token');
    } catch (error) {
      console.error('❌ Failed to exchange authorization code:', error);
      throw new Error('OAuth token exchange failed');
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      console.log('🔄 Refreshing access token...');

      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      });

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

      console.log('✅ Successfully refreshed access token');
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error);
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Get a valid access token (refresh if necessary)
   */
  async getAccessToken(): Promise<string> {
    // Check if token needs refresh (5 minutes before expiry)
    if (this.accessToken && Date.now() >= this.tokenExpiry - 300000) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new Error('No access token available. Please complete OAuth flow first.');
    }

    return this.accessToken;
  }

  /**
   * Check if we have a valid access token
   */
  hasValidToken(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiry - 300000;
  }

  /**
   * Start a simple OAuth flow with user interaction
   */
  async startOAuthFlow(): Promise<void> {
    const authUrl = this.getAuthorizationUrl();
    
    console.log('\n🔐 YouTube OAuth Authentication Required');
    console.log('=====================================');
    console.log('To create playlists on YouTube, you need to grant permission.');
    console.log('\n📋 Steps:');
    console.log('1. A browser window will open with Google OAuth');
    console.log('2. Sign in to your Google account');
    console.log('3. Grant permission to manage your YouTube playlists');
    console.log('4. Copy the authorization code from the success page');
    console.log('5. Paste it back here when prompted');
    
    console.log('\n🌐 Opening browser...');
    await this.openBrowser(authUrl);
    
    // Wait a moment for browser to open
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n📝 After completing OAuth in your browser:');
    console.log('Please copy the authorization code and run:');
    console.log('npm run dev <playlist_id> <authorization_code>');
    
    throw new Error('OAuth flow initiated. Please complete in browser and restart with authorization code.');
  }

  /**
   * Open the default browser with the authorization URL
   */
  private async openBrowser(url: string): Promise<void> {
    const start = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';
    
    try {
      spawn(start, [url], { detached: true, stdio: 'ignore' });
    } catch (error) {
      console.log('\n⚠️ Could not open browser automatically.');
      console.log('Please manually open this URL in your browser:');
      console.log(url);
    }
  }

  /**
   * Set tokens manually (for testing or if tokens are stored)
   */
  setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    if (expiresIn) this.tokenExpiry = Date.now() + (expiresIn * 1000);
  }
} 