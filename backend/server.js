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

// Add this to your database schema (run this SQL)
const spotifySchemaSQL = `
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS spotify_access_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_connected BOOLEAN DEFAULT FALSE;
`;

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
  const { email } = req.body;
  
  try {
    // Find user by email
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const friendId = userResult.rows[0].id;

    // Check if friendship already exists
    const existingFriend = await pool.query(
      `SELECT * FROM friends 
       WHERE (user_id = $1 AND friend_id = $2)
       OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, friendId]
    );

    if (existingFriend.rows.length > 0) {
      return res.status(400).json({ error: 'Friendship already exists' });
    }

    // Create new friendship
    await pool.query(
      `INSERT INTO friends (user_id, friend_id, status) 
       VALUES ($1, $2, 'accepted')`,
      [req.user.id, friendId]
    );

    res.json({ message: 'Friend added successfully' });
  } catch (err) {
    console.error('Error adding friend:', err);
    res.status(500).json({ error: 'Server error' });
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
  res.status(200).json({ status: 'ok' });
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
  res.status(500).json({ 
    error: 'Server error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
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
    const scopes = ['user-read-currently-playing', 'playlist-read-private'];
    
    // Pass the JWT token as the state parameter
    const state = req.headers.authorization.split(' ')[1];
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    
    console.log('Authorization URL:', authorizeURL);
    res.redirect(authorizeURL);
  } catch (err) {
    console.error('Spotify auth error:', err);
    res.status(500).json({ 
      error: 'Failed to initialize Spotify authorization',
      details: err.message 
    });
  }
});

// Spotify callback
app.get('/auth/spotify/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const data = await spotifyApi.authorizationCodeGrant(code);
    
    // Get user from token in query params or session
    const token = req.query.state; // We'll pass the user's JWT token in the state parameter
    let userId;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      console.error('Token verification failed:', err);
      return res.status(401).json({ error: 'Authentication failed' });
    }

    // Store tokens in user's record
    await pool.query(
      `UPDATE users 
       SET spotify_access_token = $1, 
           spotify_refresh_token = $2,
           spotify_connected = true
       WHERE id = $3`,
      [data.body.access_token, data.body.refresh_token, userId]
    );

    // Redirect back to chat with success parameter
    res.redirect('/chat?spotify=connected');
  } catch (err) {
    console.error('Spotify auth error:', err);
    res.redirect('/chat?spotify=error');
  }
});

// Get user's current playing track
app.get('/spotify/current-track', authenticateToken, async (req, res) => {
  try {
    const userTokens = await pool.query(
      'SELECT spotify_access_token FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userTokens.rows[0]?.spotify_access_token) {
      return res.status(401).json({ error: 'Spotify not connected' });
    }

    spotifyApi.setAccessToken(userTokens.rows[0].spotify_access_token);
    const data = await spotifyApi.getMyCurrentPlayingTrack();
    
    res.json(data.body);
  } catch (err) {
    console.error('Spotify API error:', err);
    res.status(500).json({ error: 'Failed to fetch current track' });
  }
});

const PORT = process.env.PORT || 8001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});