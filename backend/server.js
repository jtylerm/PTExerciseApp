// backend/server.js
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Database = require('./db/database');

const app = express();
const PORT = 3000;

const NINJA_API_KEY = process.env.NINJA_API_KEY;

console.log('=== ENV DEBUG ===');
console.log('NINJA_API_KEY exists?', !!NINJA_API_KEY);
console.log('NINJA_API_KEY length:', NINJA_API_KEY?.length);
console.log('First 5 chars:', NINJA_API_KEY?.substring(0, 5));
console.log('=================');

// Enable CORS for frontend (running on different port/origin)
app.use(cors());
app.use(express.json());

// Cache for free-exercise-db data
let exerciseDatabase = null;

// Load the free-exercise-db on startup
async function loadExerciseDatabase() {
  try {
    const response = await axios.get('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json');
    exerciseDatabase = response.data;
    console.log(`Loaded ${exerciseDatabase.length} exercises from free-exercise-db`);
  } catch (error) {
    console.error('Error loading exercise database:', error.message);
  }
}

// Run migration on startup to add is_favorited column if needed
async function runMigration() {
  const db = new Database();
  try {
    await db.connect();
    await db.migrateAddFavorited();
    await db.close();
  } catch (error) {
    console.error('Migration error:', error.message);
    await db.close();
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Exercise API Proxy is running' });
});

// Search endpoint for exercises by name - NOW USING DATABASE
app.get('/api/exercises/search', async (req, res) => {
  const db = new Database();
  
  try {
    const { query, offset = 0 } = req.query;
    
    console.log(`Searching database for: "${query}"`);
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ 
        error: 'Query parameter is required',
        message: 'Please provide a search query'
      });
    }
    
    await db.connect();
    
    // Search in database (returns up to 100 results)
    const exercises = await db.searchExercises(query, 100);
    
    await db.close();
    
    // Transform database format to match frontend expectations
    const transformedExercises = exercises.map(ex => ({
      id: ex.id,
      name: ex.exercise_name,
      type: ex.exercise_type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions: ex.instructions,
      is_favorited: ex.is_favorited === 1
    }));
    
    console.log(`Found ${transformedExercises.length} exercises in database for "${query}"`);
    res.json(transformedExercises);
    
  } catch (error) {
    console.error('Error searching exercises:', error.message);
    await db.close();
    res.status(500).json({
      error: 'Failed to search exercises',
      message: error.message
    });
  }
});

// Get exercises endpoint - NOW USING DATABASE
app.get('/api/exercises', async (req, res) => {
  const db = new Database();
  
  try {
    console.log('Fetching exercises from database...');
    
    await db.connect();
    
    // Fetch exercises from multiple muscle groups to get variety
    const muscleGroups = ['biceps', 'triceps', 'chest', 'back', 'shoulders', 'legs'];
    const allExercises = [];
    
    for (const muscle of muscleGroups) {
      const exercises = await db.getExercises({ muscle, limit: 10 });
      allExercises.push(...exercises);
      console.log(`Fetched ${exercises.length} ${muscle} exercises from database`);
    }
    
    await db.close();
    
    // Transform database format to match frontend expectations
    const transformedExercises = allExercises.map(ex => ({
      id: ex.id,
      name: ex.exercise_name,
      type: ex.exercise_type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions: ex.instructions,
      is_favorited: ex.is_favorited === 1
    }));
    
    // DEBUG: Log what we're actually returning
    console.log('\n=== DEBUG: Sample Exercise (transformed) ===');
    if (transformedExercises.length > 0) {
      console.log(JSON.stringify(transformedExercises[0], null, 2));
    }
    console.log('==============================\n');
    
    console.log(`Total exercises fetched from database: ${transformedExercises.length}`);
    res.json(transformedExercises);
    
  } catch (error) {
    console.error('Error fetching exercises from database:', error.message);
    await db.close();
    
    // Fallback to API if database fails
    console.log('Falling back to API...');
    try {
      const muscleGroups = ['biceps', 'triceps', 'chest', 'back', 'shoulders', 'legs'];
      const allExercises = [];
      
      for (const muscle of muscleGroups) {
        const response = await axios.get('https://api.api-ninjas.com/v1/exercises', {
          headers: { 'X-Api-Key': NINJA_API_KEY },
          params: { muscle: muscle }
        });
        allExercises.push(...response.data);
      }
      
      console.log(`Fetched ${allExercises.length} exercises from API fallback`);
      res.json(allExercises);
    } catch (apiError) {
      res.status(500).json({
        error: 'Failed to fetch exercises from both database and API',
        message: apiError.message
      });
    }
  }
});

// NEW: Get favorited exercises only
app.get('/api/exercises/favorites', async (req, res) => {
  const db = new Database();
  
  try {
    await db.connect();
    const favorites = await db.getFavorites();
    await db.close();
    
    // Transform database format to match frontend expectations
    const transformedFavorites = favorites.map(ex => ({
      id: ex.id,
      name: ex.exercise_name,
      type: ex.exercise_type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions: ex.instructions,
      is_favorited: true
    }));
    
    console.log(`Fetched ${transformedFavorites.length} favorite exercises`);
    res.json(transformedFavorites);
    
  } catch (error) {
    console.error('Error fetching favorites:', error.message);
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// NEW: Toggle favorite status for an exercise
app.patch('/api/exercises/:id/favorite', async (req, res) => {
  const db = new Database();
  
  try {
    const { id } = req.params;
    
    console.log(`=== Toggle Favorite Request for ID: ${id} ===`);
    
    await db.connect();
    
    // Toggle the favorite
    const result = await db.toggleFavorite(id);
    console.log(`Toggle result:`, result);
    
    if (result.changes === 0) {
      console.log(`No changes made - exercise ${id} not found`);
      await db.close();
      return res.status(404).json({ error: 'Exercise not found' });
    }
    
    // Get the updated exercise to return current state
    const exercise = await db.getExerciseById(id);
    console.log(`Retrieved exercise after toggle:`, exercise);
    
    if (!exercise) {
      console.log(`ERROR: Exercise ${id} not found after toggle`);
      await db.close();
      return res.status(404).json({ error: 'Exercise not found after toggle' });
    }
    
    await db.close();
    
    const transformed = {
      id: exercise.id,
      name: exercise.exercise_name,
      type: exercise.exercise_type,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty,
      instructions: exercise.instructions,
      is_favorited: exercise.is_favorited === 1
    };
    
    console.log(`SUCCESS: Toggled favorite for exercise ID ${id}: ${transformed.is_favorited}`);
    console.log(`Sending response:`, transformed);
    console.log('===========================================\n');
    
    res.json(transformed);
    
  } catch (error) {
    console.error('ERROR in toggle favorite:', error);
    try {
      await db.close();
    } catch (closeError) {
      console.error('Error closing database:', closeError);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get single exercise by ID from database
app.get('/api/exercises/:id', async (req, res) => {
  const db = new Database();
  
  try {
    const { id } = req.params;
    
    await db.connect();
    const exercise = await db.getExerciseById(id);
    await db.close();
    
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    
    // Transform to match frontend expectations
    const transformed = {
      id: exercise.id,
      name: exercise.exercise_name,
      type: exercise.exercise_type,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty,
      instructions: exercise.instructions,
      is_favorited: exercise.is_favorited === 1
    };
    
    res.json(transformed);
    
  } catch (error) {
    console.error('Error fetching exercise:', error.message);
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// Create a new exercise in database
app.post('/api/exercises', async (req, res) => {
  const db = new Database();
  
  try {
    const { name, type, muscle, equipment, difficulty, instructions, is_favorited } = req.body;
    
    // Validate required fields
    if (!name || !type || !muscle || !equipment || !difficulty || !instructions) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['name', 'type', 'muscle', 'equipment', 'difficulty', 'instructions']
      });
    }
    
    await db.connect();
    
    // Check if exercise already exists
    const exists = await db.exerciseExists(name);
    if (exists) {
      await db.close();
      return res.status(409).json({ error: 'Exercise with this name already exists' });
    }
    
    const newExercise = await db.createExercise({
      name,
      type,
      muscle,
      equipment,
      difficulty,
      instructions,
      is_favorited: is_favorited || false
    });
    
    await db.close();
    
    console.log(`Created new exercise: ${name}`);
    res.status(201).json(newExercise);
    
  } catch (error) {
    console.error('Error creating exercise:', error.message);
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// Update an exercise in database
app.put('/api/exercises/:id', async (req, res) => {
  const db = new Database();
  
  try {
    const { id } = req.params;
    const updates = req.body;
    
    await db.connect();
    
    const result = await db.updateExercise(id, updates);
    
    if (result.changes === 0) {
      await db.close();
      return res.status(404).json({ error: 'Exercise not found' });
    }
    
    const updatedExercise = await db.getExerciseById(id);
    await db.close();
    
    // Transform response
    const transformed = {
      id: updatedExercise.id,
      name: updatedExercise.exercise_name,
      type: updatedExercise.exercise_type,
      muscle: updatedExercise.muscle,
      equipment: updatedExercise.equipment,
      difficulty: updatedExercise.difficulty,
      instructions: updatedExercise.instructions,
      is_favorited: updatedExercise.is_favorited === 1
    };
    
    console.log(`Updated exercise ID ${id}`);
    res.json(transformed);
    
  } catch (error) {
    console.error('Error updating exercise:', error.message);
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// Delete an exercise from database
app.delete('/api/exercises/:id', async (req, res) => {
  const db = new Database();
  
  try {
    const { id } = req.params;
    
    await db.connect();
    const result = await db.deleteExercise(id);
    await db.close();
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    
    console.log(`Deleted exercise ID ${id}`);
    res.json({ message: 'Exercise deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting exercise:', error.message);
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// Database stats endpoint
app.get('/api/db/stats', async (req, res) => {
  const db = new Database();
  
  try {
    await db.connect();
    
    const total = await db.getExerciseCount();
    const favoriteCount = await db.getExerciseCount({ is_favorited: true });
    const muscles = ['biceps', 'triceps', 'chest', 'back', 'shoulders', 'legs', 
                     'abdominals', 'calves', 'glutes', 'hamstrings', 'quadriceps'];
    const stats = {};
    
    for (const muscle of muscles) {
      const count = await db.getExerciseCount({ muscle });
      if (count > 0) {
        stats[muscle] = count;
      }
    }
    
    await db.close();
    
    res.json({
      total,
      favorites: favoriteCount,
      byMuscle: stats
    });
    
  } catch (error) {
    await db.close();
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get exercise image from free-exercise-db
app.get('/api/exercise-image/:exerciseName', async (req, res) => {
  try {
    const { exerciseName } = req.params;
    
    // If database not loaded yet, try to load it
    if (!exerciseDatabase) {
      await loadExerciseDatabase();
    }
    
    if (!exerciseDatabase) {
      return res.json({ images: null, found: false });
    }
    
    // Normalize the exercise name for comparison
    const normalizedSearchName = exerciseName.toLowerCase()
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Search for matching exercise (fuzzy match)
    const matchingExercise = exerciseDatabase.find(ex => {
      const normalizedExName = ex.name.toLowerCase()
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return normalizedExName.includes(normalizedSearchName) || 
             normalizedSearchName.includes(normalizedExName);
    });
    
    if (matchingExercise && matchingExercise.images && matchingExercise.images.length > 0) {
      console.log(`Found match for "${exerciseName}": ${matchingExercise.name} with ${matchingExercise.images.length} images`);
      // Construct the full GitHub URLs for all images
      const imageUrls = matchingExercise.images.map(img => 
        `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${img}`
      );
      return res.json({ images: imageUrls, found: true });
    }
    
    console.log(`No match found for "${exerciseName}"`);
    // If no match found, return null
    res.json({ images: null, found: false });
    
  } catch (error) {
    console.error(`Error fetching image for ${req.params.exerciseName}:`, error.message);
    res.json({ images: null, found: false });
  }
});

// Load exercise database and run migration on server start
loadExerciseDatabase();
runMigration();

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/exercises`);
  console.log(`Search endpoint: http://localhost:${PORT}/api/exercises/search?query=curl`);
  console.log(`Favorites endpoint: http://localhost:${PORT}/api/exercises/favorites`);
  console.log(`Database stats: http://localhost:${PORT}/api/exercises/stats`);
});