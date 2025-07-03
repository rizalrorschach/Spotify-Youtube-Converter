# 🎵 Spotify to YouTube Playlist Converter

A powerful TypeScript tool that automatically converts Spotify playlists to YouTube playlists using the Spotify Web API and YouTube Data API v3. This tool features a two-phase system that can handle playlists of any size while respecting API quota limits.

## 🚀 Features

- ✅ **Two-Phase System**: Handle unlimited playlist sizes over multiple days
- ✅ **Resumable Processing**: Continue where you left off if interrupted
- ✅ **Smart Track Matching**: Intelligent YouTube search with confidence scoring
- ✅ **Quota Management**: Built-in quota tracking and management
- ✅ **Error Recovery**: Retry failed tracks and handle API errors gracefully
- ✅ **Progress Persistence**: All progress saved automatically
- ✅ **Clean, Modular Code**: Well-structured TypeScript codebase

## 📋 Prerequisites

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Spotify Account** (free or premium)
- **Google Account** (for YouTube API access)

## 🛠️ Installation

1. **Clone or download this project:**
   ```bash
   git clone https://github.com/rizalrorschach/Spotify-Youtube-Converter
   cd spotify-to-youtube-converter
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Copy environment template:**
   ```bash
   cp env.template .env
   ```

4. **Configure your `.env` file** (see detailed setup instructions below)

## 🔧 Step-by-Step API Setup

### Step 1: Spotify API Setup

#### 1.1 Create Spotify Developer Account
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **"Log In"** and sign in with your Spotify account
3. Accept the terms of service

#### 1.2 Create a New Application
1. Click **"Create App"** button
2. Fill in the application details:
   - **App name**: `Spotify to YouTube Converter` (or any name you prefer)
   - **App description**: `Convert Spotify playlists to YouTube playlists`
   - **Website**: `http://localhost:3000` (or your website if you have one)
   - **Redirect URI**: `http://127.0.0.1:3000/callback`
   - **API/SDKs**: Check "Web API"
3. Click **"Save"**

#### 1.3 Get Your Credentials
1. You'll be redirected to your app dashboard
2. Copy the **Client ID** (a long string of letters and numbers)
3. Click **"Show Client Secret"** and copy the **Client Secret**
4. Add these to your `.env` file:
   ```env
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   ```

### Step 2: YouTube API Setup

#### 2.1 Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Enter a project name: `Spotify YouTube Converter`
4. Click **"Create"**

#### 2.2 Enable YouTube Data API
1. In your new project, go to **"APIs & Services"** → **"Library"**
2. Search for **"YouTube Data API v3"**
3. Click on it and press **"Enable"**

#### 2.3 Create API Key
1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"API Key"**
3. Copy the generated API key
4. Add it to your `.env` file:
   ```env
   YOUTUBE_API_KEY=your_api_key_here
   ```

#### 2.4 Create OAuth 2.0 Credentials (for playlist creation)
1. In the same Credentials page, click **"Create Credentials"** → **"OAuth 2.0 Client IDs"**
2. If prompted, configure the OAuth consent screen:
   - **User Type**: External
   - **App name**: `Spotify to YouTube Converter`
   - **User support email**: Your email
   - **Developer contact information**: Your email
   - **Scopes**: Add `https://www.googleapis.com/auth/youtube` and `https://www.googleapis.com/auth/youtube.force-ssl`
3. Click **"Save and Continue"** through the remaining steps
4. Back in Credentials, click **"Create Credentials"** → **"OAuth 2.0 Client IDs"**
5. Choose **"Web application"**
6. Set **Authorized redirect URIs**: `http://127.0.0.1:3000/callback`
7. Click **"Create"**
8. Copy the **Client ID** and **Client Secret**
9. Add them to your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your_oauth_client_id_here
   GOOGLE_CLIENT_SECRET=your_oauth_client_secret_here
   GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/callback
   ```

### Step 3: Final Environment Configuration

Your complete `.env` file should look like this:
```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# YouTube Data API Credentials  
YOUTUBE_API_KEY=your_youtube_api_key_here

# Google OAuth 2.0 Credentials (for YouTube playlist creation)
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret_here
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/callback

# Optional: Spotify Playlist ID to convert (can also be passed as command line argument)
SPOTIFY_PLAYLIST_ID=4OA5qo67rHBa7KY34NuHPf

# Optional: YouTube Playlist Name (will be auto-generated if not provided)
YOUTUBE_PLAYLIST_NAME=My Converted Playlist

# Optional: Maximum tracks to convert (default: 50, helps manage YouTube API quota)
MAX_TRACKS_TO_CONVERT=50

# Optional: Batch size for search-tracks script (default: 50)
SEARCH_BATCH_SIZE=50
```

## 🔐 Understanding OAuth Authorization Codes

### **What is an Authorization Code?**

An authorization code is a temporary code that allows the tool to create YouTube playlists on your behalf. It's required because creating playlists requires your personal YouTube account permissions.

### **When Do You Need an Authorization Code?**

You need an authorization code when:
- ✅ **Creating YouTube playlists** (Phase 2: `create-playlist`)
- ✅ **Retrying failed tracks** (`retry-failed`)
- ❌ **Searching for videos** (Phase 1: `search-tracks` - not needed)

### **How to Get an Authorization Code**

#### **Method 1: Automatic OAuth Flow (Recommended)**

When you run a script that needs OAuth, it will automatically start the flow:

```bash
npm run create-playlist 4OA5qo67rHBa7KY34NuHPf
```

**What happens:**
1. Script opens your browser automatically
2. You sign in to your Google account
3. You grant permission to manage YouTube playlists
4. You get redirected to a success page with the authorization code
5. Copy the code from the URL or page
6. Restart the script with the code:

```bash
npm run create-playlist 4OA5qo67rHBa7KY34NuHPf 4/0AVMBsJh...
```

#### **Method 2: Manual OAuth Flow**

If the automatic flow doesn't work, you can get the code manually:

1. **Open this URL in your browser:**
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://127.0.0.1:3000/callback&scope=https://www.googleapis.com/auth/youtube%20https://www.googleapis.com/auth/youtube.force-ssl&response_type=code&access_type=offline&prompt=consent
   ```
   (Replace `YOUR_CLIENT_ID` with your actual Google OAuth Client ID)

2. **Sign in to your Google account**

3. **Grant permissions** to manage YouTube playlists

4. **Copy the authorization code** from the success page URL

5. **Use the code** with your script:
   ```bash
   npm run create-playlist 4OA5qo67rHBa7KY34NuHPf YOUR_AUTH_CODE
   ```

### **Authorization Code Format**

Authorization codes look like this:
```
4/0AVMBsJh...
```

**Key characteristics:**
- Starts with `4/0`
- Contains letters, numbers, and sometimes special characters
- Usually 50-100 characters long
- **Expires quickly** (usually within 10 minutes)
- **One-time use** - can only be used once

### **When Authorization Codes Expire**

Authorization codes expire:
- ⏰ **After 10 minutes** (Google's default)
- ⏰ **After being used once** (even if successful)
- ⏰ **If you get a new one** (invalidates the old one)

**If your code expires:**
1. Get a new authorization code using the same process
2. Use the new code with your script
3. No need to restart from the beginning

### **OAuth Token Storage**

After using an authorization code successfully:
- ✅ The tool stores a **refresh token** automatically
- ✅ Future runs won't need new authorization codes
- ✅ The refresh token lasts much longer (usually months)
- ✅ Only need new authorization codes if refresh token expires

## 🎯 How to Use

### Quick Start (Small Playlists - Up to 50 tracks)

For playlists with 50 tracks or fewer, you can use the simple one-step process:

```bash
# Build the project
npm run build

# Run the converter (will prompt for OAuth if needed)
npm run dev <spotify_playlist_id_or_url>
```

**Example:**
```bash
npm run dev 4OA5qo67rHBa7KY34NuHPf
```

### Two-Phase System (Large Playlists - Any Size)

For playlists with more than 50 tracks, use the two-phase system:

#### Phase 1: Search for YouTube Matches
```bash
# Search first batch of tracks (default 50 tracks)
npm run search-tracks <playlist_id_or_url>

# Or specify custom batch size
npm run search-tracks <playlist_id_or_url> 100

# Continue searching remaining tracks (run multiple times)
npm run search-tracks <playlist_id_or_url>
```

**Examples:**
```bash
# Search first 50 tracks
npm run search-tracks 4OA5qo67rHBa7KY34NuHPf

# Search first 100 tracks (uses more quota)
npm run search-tracks 4OA5qo67rHBa7KY34NuHPf 100

# Continue from where you left off
npm run search-tracks 4OA5qo67rHBa7KY34NuHPf
```

#### Phase 2: Create YouTube Playlist
```bash
# After all tracks are searched, create the playlist
npm run create-playlist <playlist_id_or_url> [authorization_code]
```

**Examples:**
```bash
# Will prompt for OAuth if needed
npm run create-playlist 4OA5qo67rHBa7KY34NuHPf

# With authorization code (if you have one)
npm run create-playlist 4OA5qo67rHBa7KY34NuHPf 4/0AVMBsJh...
```

#### Retry Failed Tracks (Optional)
If some tracks failed to be added to the playlist, you can retry them:

```bash
npm run retry-failed <playlist_id_or_url> [authorization_code]
```

**Examples:**
```bash
# Will prompt for OAuth if needed
npm run retry-failed 4OA5qo67rHBa7KY34NuHPf

# With authorization code (if you have one)
npm run retry-failed 4OA5qo67rHBa7KY34NuHPf 4/0AVMBsJh...
```

## 📊 Understanding the Scripts

### `npm run dev` (Single-Phase)
- **Purpose**: Complete conversion in one step
- **Best for**: Playlists with 50 tracks or fewer
- **Process**: Searches YouTube → Creates playlist → Adds videos
- **Quota usage**: ~100 units per track + 50 for playlist creation
- **OAuth needed**: ✅ Yes (for playlist creation)

### `npm run search-tracks` (Phase 1)
- **Purpose**: Search YouTube for matches to Spotify tracks
- **Best for**: Large playlists that need to be processed over multiple days
- **Process**: Searches YouTube for each track and saves results
- **Quota usage**: 100 units per track searched
- **Resumable**: Can be run multiple times to continue where you left off
- **Output**: Saves progress to `data/{playlist_id}-search-progress.json`
- **OAuth needed**: ❌ No (only searches, doesn't create playlists)

### `npm run create-playlist` (Phase 2)
- **Purpose**: Create YouTube playlist from search results
- **Best for**: After Phase 1 is complete
- **Process**: Creates playlist and adds all found videos
- **Quota usage**: 50 units for playlist creation + 50 per video added
- **Input**: Reads from `data/{playlist_id}-search-progress.json`
- **Output**: Saves results to `data/{playlist_id}-playlist-result.json`
- **OAuth needed**: ✅ Yes (creates playlists on your YouTube account)

### `npm run retry-failed` (Recovery)
- **Purpose**: Retry adding tracks that failed during playlist creation
- **Best for**: When some videos couldn't be added due to temporary issues
- **Process**: Attempts to add failed videos again
- **Quota usage**: 50 units per retry attempt
- **Input**: Reads from `data/{playlist_id}-playlist-result.json`
- **OAuth needed**: ✅ Yes (adds videos to your YouTube playlist)

## 📁 Understanding the Data Files

The tool creates several files in the `data/` directory:

### `{playlist_id}-search-progress.json`
- Contains all search results from Phase 1
- Includes track information, YouTube matches, and confidence scores
- Used by Phase 2 to create the playlist
- Can be safely backed up and shared

### `{playlist_id}-playlist-result.json`
- Contains final conversion results
- Includes playlist creation details and success/failure information
- Used by retry script to attempt failed tracks again

## 💰 Understanding API Quota

### YouTube API Daily Limits
- **Daily quota**: 10,000 units per Google Cloud project
- **Search operation**: 100 units per track
- **Create playlist**: 50 units
- **Add video to playlist**: 50 units per video

### Example Quota Usage
For a 100-track playlist:
- **Phase 1 (Search)**: 100 tracks × 100 units = 10,000 units
- **Phase 2 (Create)**: 50 + (80 tracks × 50 units) = 4,050 units
- **Total**: 14,050 units (exceeds daily limit)

**Solution**: Use the two-phase system over multiple days:
- **Day 1**: Search 50 tracks (5,000 units)
- **Day 2**: Search 50 tracks (5,000 units)
- **Day 3**: Create playlist (4,050 units)

## 🎵 Getting Spotify Playlist IDs

### Method 1: From Spotify URL
1. Open your playlist in Spotify
2. Click **"Share"** → **"Copy link to playlist"**
3. The URL will look like: `https://open.spotify.com/playlist/4OA5qo67rHBa7KY34NuHPf`
4. The playlist ID is: `4OA5qo67rHBa7KY34NuHPf`

### Method 2: From Spotify App
1. Right-click on your playlist
2. Select **"Share"** → **"Copy Spotify URI"**
3. The URI will look like: `spotify:playlist:4OA5qo67rHBa7KY34NuHPf`
4. The playlist ID is: `4OA5qo67rHBa7KY34NuHPf`

### Method 3: Direct ID
If you know the playlist ID (22-character string), you can use it directly.

## 🔍 Troubleshooting

### Common Issues

#### "Missing required environment variables"
- **Solution**: Make sure all variables in your `.env` file are set correctly
- **Check**: No extra spaces or quotes around values

#### "API connection test failed"
- **Solution**: Verify your API credentials are correct
- **Check**: Client IDs, secrets, and API keys match your developer accounts

#### "Quota exceeded"
- **Solution**: Wait until quota resets (midnight PT) or use a different Google Cloud project
- **Alternative**: Reduce batch size in Phase 1

#### "OAuth flow initiated"
- **Solution**: This is expected. Complete the OAuth flow in your browser and restart with the authorization code
- **Process**: Follow the browser prompts to grant YouTube permissions

#### "Search progress file not found"
- **Solution**: Run Phase 1 (`npm run search-tracks`) before Phase 2

#### "No tracks with YouTube matches found"
- **Solution**: Check your YouTube API key and try running Phase 1 again

#### "Authorization code expired"
- **Solution**: Get a new authorization code using the OAuth flow
- **Note**: Authorization codes expire after 10 minutes or one use

#### "Invalid authorization code"
- **Solution**: Make sure you copied the entire code correctly
- **Check**: Code should start with `4/0` and be 50-100 characters long

### Getting Help

1. **Check the logs**: The tool provides detailed output about what's happening
2. **Verify credentials**: Double-check all API keys and secrets
3. **Check quota**: Monitor your YouTube API quota usage
4. **Review data files**: Check the JSON files in the `data/` directory for detailed information

## 📈 Advanced Usage

### Multiple Google Cloud Projects
For unlimited daily processing, create multiple Google Cloud projects:

```bash
# Day 1: Project 1
YOUTUBE_API_KEY=project1_api_key
npm run search-tracks playlist_id 100

# Day 1: Project 2  
YOUTUBE_API_KEY=project2_api_key
npm run search-tracks playlist_id 100
# Result: 200 tracks searched in one day!
```

### Custom Batch Sizes
Adjust batch sizes based on your quota needs:

```bash
# Conservative (safe for daily quota)
npm run search-tracks playlist_id 25    # 2,500 units

# Aggressive (uses full daily quota)
npm run search-tracks playlist_id 100   # 10,000 units

# Custom size
npm run search-tracks playlist_id 75    # 7,500 units
```

### Progress Management
- **Auto-save**: Progress saved every 5 tracks automatically
- **Portable**: Copy `data/` folder to backup/share progress
- **Resumable**: Always continues from last saved position
- **API-agnostic**: Switch API keys without losing progress

## 📄 License

ISC License

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

**Happy converting! 🎵➡️🎬** 