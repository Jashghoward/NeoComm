require("dotenv").config();

// Add this right after to verify the variables are loaded
console.log('Environment Variables Check:', {
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ? 'Set' : 'Not set',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET ? 'Set' : 'Not set'
});

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const multer = require('multer');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const spotifyConfig = require('./config/spotify');
const OpenAI = require('openai');
const googleCalendarService = require('./integrations/googleCalendar');
const { google } = require('googleapis');
const fileService = require('./services/fileService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((error) => console.error("Connection error", error.stack));

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token." });
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
  }
});

// Initialize Spotify API with config
const spotifyApi = new SpotifyWebApi(spotifyConfig);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add this to your database schema (run this SQL)
const spotifySchemaSQL = `
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS spotify_access_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_connected BOOLEAN DEFAULT FALSE;
`;

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Signup route
app.post("/auth/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "All fields are required" });

  try {
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) return res.status(400).json({ error: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: "User created", user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login route
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "All fields are required" });

  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0 || !(await bcrypt.compare(password, user.rows[0].password))) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.rows[0].id, username: user.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user profile
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, status, profile_picture FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = result.rows[0];
    
    // Add full URL to profile picture if it exists
    if (profile.profile_picture && !profile.profile_picture.startsWith('http')) {
      profile.profile_picture = `http://localhost:8001${profile.profile_picture}`;
    }

    res.json(profile);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update the message creation endpoint for better real-time handling
app.post("/messages", authenticateToken, async (req, res) => {
  const { receiver_id, content } = req.body;
  
  try {
    // Verify friendship exists
    const friendshipCheck = await pool.query(
      `SELECT * FROM friends 
       WHERE (user_id = $1 AND friend_id = $2) 
       OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, receiver_id]
    );

    if (friendshipCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    // Insert the message and get complete message data in one query
    const result = await pool.query(
      `WITH inserted_message AS (
        INSERT INTO messages (sender_id, receiver_id, content) 
        VALUES ($1, $2, $3) 
        RETURNING *
      )
      SELECT 
        m.*,
        sender.username as sender_username,
        sender.profile_picture as sender_profile_picture,
        receiver.username as receiver_username,
        receiver.profile_picture as receiver_profile_picture
      FROM inserted_message m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id`,
      [req.user.id, receiver_id, content]
    );

    const completeMessage = {
      ...result.rows[0],
      sender_profile_picture: result.rows[0].sender_profile_picture ? 
        `http://localhost:8001/uploads/${result.rows[0].sender_profile_picture.split('/').pop()}` : null,
      receiver_profile_picture: result.rows[0].receiver_profile_picture ? 
        `http://localhost:8001/uploads/${result.rows[0].receiver_profile_picture.split('/').pop()}` : null
    };

    // Emit to both sender and receiver with a specific event name
    io.emit('receiveMessage', completeMessage);

    res.status(201).json(completeMessage);
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get messages between two users
app.get("/messages/:friendId", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
        u1.username as sender_username, 
        u1.profile_picture as sender_profile_picture,
        u2.username as receiver_username,
        u2.profile_picture as receiver_profile_picture
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.receiver_id = u2.id
       WHERE (sender_id = $1 AND receiver_id = $2)
       OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY sent_at ASC`,
      [req.user.id, req.params.friendId]
    );

    // Add full URLs to profile pictures
    const messages = result.rows.map(message => ({
      ...message,
      sender_profile_picture: message.sender_profile_picture ? 
        `http://localhost:8001${message.sender_profile_picture}` : null,
      receiver_profile_picture: message.receiver_profile_picture ? 
        `http://localhost:8001${message.receiver_profile_picture}` : null
    }));

    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get freinds
app.get("/friends", async (req, res) => {
  try {
    const friends = await getFriendsFromDB(req.user.id);  // Example function
    res.json(friends);
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update the add friend endpoint with better error handling and logging
app.post('/friends/add', authenticateToken, async (req, res) => {
  const { user_id, email } = req.body;

  try {
    // Check if the user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const friendId = userResult.rows[0].id;

    // Add the friend relationship without the status column
    await pool.query('INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)', [user_id, friendId]);

    res.status(201).json({ message: 'Friend added successfully' });
  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Update the friends endpoint to remove status check from friends table
app.get('/friends/:userId', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching friends for user:', req.params.userId);
    
    const query = `
      SELECT DISTINCT
        u.id, 
        u.username, 
        u.email, 
        u.status, 
        u.profile_picture
      FROM users u 
      INNER JOIN friends f 
      ON (f.user_id = $1 AND f.friend_id = u.id) 
      OR (f.friend_id = $1 AND f.user_id = u.id)
    `;

    const result = await pool.query(query, [req.params.userId]);

    const friends = result.rows.map(friend => ({
      ...friend,
      profile_picture: friend.profile_picture && !friend.profile_picture.startsWith('http') ? 
        `http://localhost:8001/uploads/${friend.profile_picture.split('/').pop()}` : friend.profile_picture
    }));

    res.json(friends);
  } catch (err) {
    console.error('Error in friends endpoint:', err);
    res.status(500).json({ 
      error: 'Server error', 
      details: err.message 
    });
  }
});

// Add a debug endpoint to check friends table
app.get('/debug/friends', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM friends');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Store the user's socket id for direct messaging
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      console.log('Authenticated user connected:', socket.userId);
    } catch (err) {
      console.error('Socket authentication error:', err);
    }
  }

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Hello, NeoComm Chat!");
});

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Profile update endpoint
app.put('/profile/update', authenticateToken, upload.single('profile_picture'), async (req, res) => {
  try {
    const { username, status } = req.body;
    const userId = req.user.id;
    let profile_picture = null;

    // If a file was uploaded, save its path with full URL
    if (req.file) {
      profile_picture = `http://localhost:8001/uploads/${req.file.filename}`;  // Add full URL
    }

    // Build the update query dynamically based on what was provided
    let updateFields = [];
    let queryParams = [];
    let paramCount = 1;

    if (username) {
      updateFields.push(`username = $${paramCount}`);
      queryParams.push(username);
      paramCount++;
    }

    if (status) {
      updateFields.push(`status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    if (profile_picture) {
      updateFields.push(`profile_picture = $${paramCount}`);
      queryParams.push(profile_picture);  // Save full URL in database
      paramCount++;
    }

    queryParams.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, username, email, status, profile_picture
    `;

    const result = await pool.query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the full profile data
    const updatedProfile = result.rows[0];
    console.log('Updated profile:', updatedProfile);
    res.json(updatedProfile);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

// Serve uploaded files with proper headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Add middleware for better error logging
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ error: err.message });
});

// Verify database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Spotify auth endpoint
app.get('/auth/spotify', authenticateToken, (req, res) => {
  try {
    const scopes = [
      'user-read-currently-playing',
      'playlist-read-private',
      'user-read-playback-state'
    ];
    
    const token = req.headers.authorization.split(' ')[1];
    // Make sure this matches exactly
    const redirectUri = 'http://localhost:8001/auth/spotify/callback';
    spotifyApi.setRedirectURI(redirectUri);
    
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, token);
    console.log('Spotify Auth URL:', authorizeURL);
    res.send(authorizeURL);
  } catch (err) {
    console.error('Spotify auth error:', err);
    res.status(500).json({ error: 'Failed to initialize Spotify authorization' });
  }
});

// Spotify callback
app.get('/auth/spotify/callback', async (req, res) => {
  try {
    const { code } = req.query;
    spotifyApi.setRedirectURI('http://localhost:8001/auth/spotify/callback');
    const data = await spotifyApi.authorizationCodeGrant(code);
    
    // ... rest of the auth code ...

    // Update redirect URL to root instead of /chat
    res.redirect('http://localhost:3000/?spotify=connected');
  } catch (err) {
    console.error('Spotify callback error:', err);
    // Update error redirect as well
    res.redirect('http://localhost:3000/?spotify=error');
  }
});

// Add an endpoint to get current playing track
app.get('/spotify/current-track', authenticateToken, async (req, res) => {
  try {
    // Get user's Spotify tokens
    const userResult = await pool.query(
      'SELECT spotify_access_token FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0]?.spotify_access_token) {
      return res.status(404).json({ error: 'Spotify not connected' });
    }

    // Set the access token
    spotifyApi.setAccessToken(userResult.rows[0].spotify_access_token);

    // Get current playing track
    const data = await spotifyApi.getMyCurrentPlaybackState();
    
    if (data.body && data.body.item) {
      const trackInfo = {
        name: data.body.item.name,
        artist: data.body.item.artists[0].name,
        album: data.body.item.album.name,
        albumArt: data.body.item.album.images[0]?.url,
        isPlaying: data.body.is_playing
      };
      res.json(trackInfo);
    } else {
      res.json({ error: 'No track currently playing' });
    }
  } catch (err) {
    console.error('Error fetching current track:', err);
    res.status(500).json({ error: 'Failed to fetch current track' });
  }
});

// Update the AI chat endpoint
app.post('/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { message, userContext } = req.body;
    
    // Create a system message that includes user context
    const systemMessage = `You are a helpful AI assistant for a chat application. 
    You're talking to ${userContext.username}, whose current status is "${userContext.status}".
    Be friendly and personable, and feel free to reference their status or username in natural ways.
    Keep responses concise (max 2-3 sentences unless specifically asked for more detail).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const aiResponse = completion.choices[0].message.content;
    
    // Log for debugging
    console.log('AI Response:', aiResponse);
    
    res.json({ response: aiResponse });
  } catch (err) {
    console.error('OpenAI error:', err);
    res.status(500).json({ 
      error: 'Failed to process AI chat request',
      details: err.message 
    });
  }
});

// Initial Google auth endpoint
app.get('/auth/google', authenticateToken, (req, res) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const state = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET);
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      prompt: 'consent'
    });

    res.json({ url: authUrl });
  } catch (err) {
    console.error('Google auth URL generation error:', err);
    res.status(500).json({ error: 'Failed to initialize Google authorization' });
  }
});

// Google OAuth callback endpoint
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      throw new Error('No authorization code received');
    }

    // Decode state to get user ID
    const decodedState = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decodedState.userId;

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Received tokens:', tokens); // For debugging

    // Store refresh token in database
    if (tokens.refresh_token) {
      await pool.query(
        'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
        [tokens.refresh_token, userId]
      );
    }

    // Redirect back to frontend with success parameter
    res.redirect('http://localhost:3000/?calendar=connected');
  } catch (err) {
    console.error('Google auth callback error:', err);
    res.redirect('http://localhost:3000/?calendar=error');
  }
});

// Update the calendar events endpoint with better logging
app.get('/calendar/events', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching events for user:', req.user.id);
    
    // Get user's refresh token
    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.user.id]
    );

    const refreshToken = result.rows[0]?.google_refresh_token;
    if (!refreshToken) {
      console.log('No refresh token found for user');
      return res.status(401).json({ error: 'Calendar not connected' });
    }

    // Set credentials using refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    // Create calendar instance
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get events for a wider range (past 30 days to next 365 days)
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30); // Include past 30 days
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 365); // Include next year

    console.log('Fetching events between:', {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString()
    });

    // Get events
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500, // Increased maximum results
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log('Found events:', response.data.items.length);
    console.log('Sample event:', response.data.items[0]); // Log first event for debugging

    res.json({ events: response.data.items });
  } catch (err) {
    console.error('Calendar events error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar events', details: err.message });
  }
});

// Update the create event endpoint to immediately return the created event
app.post('/calendar/create-event', authenticateToken, async (req, res) => {
  try {
    console.log('Creating event for user:', req.user.id);
    
    // Get user's refresh token
    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.user.id]
    );

    const refreshToken = result.rows[0]?.google_refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Calendar not connected' });
    }

    // Set up OAuth client with refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Format the event
    const event = {
      summary: req.body.summary,
      description: req.body.description,
      start: {
        dateTime: req.body.start.dateTime,
        timeZone: req.body.start.timeZone
      },
      end: {
        dateTime: req.body.end.dateTime,
        timeZone: req.body.end.timeZone
      }
    };

    console.log('Creating event:', event);

    // Create the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log('Event created:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event', details: err.message });
  }
});

// File sharing endpoints
app.post('/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileKey = await fileService.uploadFile(req.file, req.user.id);
    
    // Store file reference in database
    const result = await pool.query(
      'INSERT INTO files (user_id, file_key, filename, mime_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, fileKey, req.file.originalname, req.file.mimetype]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND user_id = $2',
      [req.params.fileId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const signedUrl = await fileService.getSignedUrl(result.rows[0].file_key);
    res.json({ url: signedUrl });
  } catch (error) {
    console.error('File access error:', error);
    res.status(500).json({ error: 'Failed to access file' });
  }
});

// Add these calendar endpoints
app.get('/calendar/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.user.id]
    );
    
    res.json({ 
      isConnected: !!result.rows[0]?.google_refresh_token 
    });
  } catch (err) {
    console.error('Calendar status error:', err);
    res.status(500).json({ error: 'Failed to check calendar status' });
  }
});

// Update event endpoint
app.put('/calendar/events/:eventId', authenticateToken, async (req, res) => {
  try {
    console.log('Updating event:', {
      eventId: req.params.eventId,
      body: req.body
    });

    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.user.id]
    );

    const refreshToken = result.rows[0]?.google_refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Calendar not connected' });
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // First, get the existing event to ensure it exists
    try {
      await calendar.events.get({
        calendarId: 'primary',
        eventId: req.params.eventId
      });
    } catch (err) {
      console.error('Event not found:', err);
      return res.status(404).json({ error: 'Event not found' });
    }

    // Update the event
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: req.params.eventId,
      requestBody: {
        summary: req.body.summary,
        description: req.body.description,
        start: req.body.start,
        end: req.body.end
      }
    });

    console.log('Event updated successfully:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ 
      error: 'Failed to update event', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Delete event endpoint
app.delete('/calendar/events/:eventId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.user.id]
    );

    const refreshToken = result.rows[0]?.google_refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Calendar not connected' });
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: req.params.eventId
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event', details: err.message });
  }
});

const PORT = process.env.PORT || 8001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});