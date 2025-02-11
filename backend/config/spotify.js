const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:8001/auth/spotify/callback'
};

// Validation and logging
if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
  console.error('Missing Spotify credentials in environment variables!');
  console.error('SPOTIFY_CLIENT_ID:', process.env.SPOTIFY_CLIENT_ID);
  console.error('SPOTIFY_CLIENT_SECRET:', process.env.SPOTIFY_CLIENT_SECRET);
}

console.log('Spotify Config Loaded:', {
  clientId: spotifyConfig.clientId ? 'Set' : 'Not set',
  clientSecret: spotifyConfig.clientSecret ? 'Set' : 'Not set',
  redirectUri: spotifyConfig.redirectUri
});

module.exports = spotifyConfig; 