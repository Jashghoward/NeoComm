require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch(error => console.error("Connection error", error.stack));


app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check if user exists
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "Email already in use "});
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

  // Insert new user
  const newUser = await pool.query(
    "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
    [username, email, hashedPassword]
  );
  

    res.status(201).json({ massage: "User created", user: newUser.rows[0]})
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error"});
  }
});


app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check if use exists
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Compare passwords
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password"});
    }

    // Generate JWT
    const token = jwt.sign({ id: user.rows[0].id, username: user.rows[0].username }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({ message: "Login Great Success!!!", token });
  } catch (err)  {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});




app.get('/', (req, res) => {
  res.send('Hello, NeoComm Chat!');
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
});

