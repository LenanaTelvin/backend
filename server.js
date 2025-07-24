const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve static files

// File upload setup
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// ✅ Root test
app.get('/', (req, res) => {
  res.send('🟢 Backend is live and running!');
});

// 🔧 DB setup
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    console.log('✅ Tables created or already exist');
  } catch (err) {
    console.error('❌ Table creation error:', err.message);
  }
};

// 📁 Upload file to project
app.post('/projects/:id/upload', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).send('No file uploaded');

  try {
    await pool.query(
      'INSERT INTO files (filename, filepath, project_id) VALUES ($1, $2, $3)',
      [file.originalname, file.path, id]
    );
    res.status(201).send('File uploaded');
  } catch (err) {
    res.status(500).send('Upload error');
  }
});

// 📁 View files of project
app.get('/projects/:id/files', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, filename FROM files WHERE project_id = $1',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Error fetching files');
  }
});

// 📁 View specific file
app.get('/files/:id/view', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).send('File not found');

    res.sendFile(path.resolve(__dirname, result.rows[0].filepath));
  } catch (err) {
    res.status(500).send('Error viewing file');
  }
});

// 📊 Project completion %
app.get('/projects/:id/completion', async (req, res) => {
  try {
    const { rows: total } = await pool.query('SELECT COUNT(*) FROM tasks WHERE project_id = $1', [req.params.id]);
    const { rows: done } = await pool.query('SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND done = true', [req.params.id]);

    const totalTasks = parseInt(total[0].count);
    const doneTasks = parseInt(done[0].count);
    const percentage = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    res.json({ percentage: percentage });
  } catch (err) {
    res.status(500).send('Error calculating completion');
  }
});

// ✅ Get all projects
app.get('/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ✅ Create new project
app.post('/projects', async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) return res.status(400).json({ error: 'Name and description are required' });

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ✅ Get tasks for a project
app.get('/projects/:id/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE project_id = $1', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Error fetching tasks');
  }
});

// ✅ Add task to a project
app.post('/projects/:id/tasks', async (req, res) => {
  const { title } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, project_id) VALUES ($1, $2) RETURNING *',
      [title, req.params.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error adding task');
  }
});

// ✅ Toggle task done status
app.put('/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error toggling task');
  }
});

// 🚀 Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await createTables();
});
