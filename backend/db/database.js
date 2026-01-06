// backend/db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor(dbPath = path.join(__dirname, 'exercises.db')) {
    this.dbPath = dbPath;
    this.db = null;
  }

  // Initialize database connection
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  // Initialize schema
  async initSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database schema initialized');
          resolve();
        }
      });
    });
  }

  // CRUD Operations

  // CREATE: Insert a new exercise
  async createExercise(exercise) {
    const { name, type, muscle, equipment, difficulty, instructions } = exercise;
    
    const sql = `
      INSERT INTO Exercises (exercise_name, exercise_type, muscle, equipment, difficulty, instructions)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [name, type, muscle, equipment, difficulty, instructions], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...exercise });
        }
      });
    });
  }

  // READ: Get all exercises with optional filters
  async getExercises(filters = {}) {
    let sql = 'SELECT * FROM Exercises WHERE 1=1';
    const params = [];

    if (filters.name) {
      sql += ' AND exercise_name LIKE ?';
      params.push(`%${filters.name}%`);
    }

    if (filters.muscle) {
      sql += ' AND muscle = ?';
      params.push(filters.muscle);
    }

    if (filters.type) {
      sql += ' AND exercise_type = ?';
      params.push(filters.type);
    }

    if (filters.difficulty) {
      sql += ' AND difficulty = ?';
      params.push(filters.difficulty);
    }

    sql += ' ORDER BY exercise_name ASC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // READ: Get single exercise by ID
  async getExerciseById(id) {
    const sql = 'SELECT * FROM Exercises WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // READ: Search exercises by name
  async searchExercises(searchTerm, limit = 10) {
    const sql = `
      SELECT * FROM Exercises 
      WHERE exercise_name LIKE ? 
      ORDER BY exercise_name ASC 
      LIMIT ?
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, [`%${searchTerm}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // UPDATE: Update an existing exercise
  async updateExercise(id, updates) {
    const allowedFields = ['exercise_name', 'exercise_type', 'muscle', 'equipment', 'difficulty', 'instructions'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add last_updated timestamp
    fields.push('last_updated = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE Exercises SET ${fields.join(', ')} WHERE id = ?`;

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // DELETE: Delete an exercise
  async deleteExercise(id) {
    const sql = 'DELETE FROM Exercises WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Utility: Get total count
  async getExerciseCount(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM Exercises WHERE 1=1';
    const params = [];

    if (filters.name) {
      sql += ' AND exercise_name LIKE ?';
      params.push(`%${filters.name}%`);
    }

    if (filters.muscle) {
      sql += ' AND muscle = ?';
      params.push(filters.muscle);
    }

    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  // Utility: Check if exercise exists by name
  async exerciseExists(name) {
    const sql = 'SELECT id FROM Exercises WHERE exercise_name = ? LIMIT 1';
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [name], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  // Close database connection
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

module.exports = Database;