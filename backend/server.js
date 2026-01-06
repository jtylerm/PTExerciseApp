// backend/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

const NINJA_API_KEY = process.env.NINJA_API_KEY;

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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Exercise API Proxy is running' });
});

// NEW: Search endpoint for exercises by name
app.get('/api/exercises/search', async (req, res) => {
  try {
    const { query, offset = 0 } = req.query;
    
    console.log(`Searching for: "${query}" with offset ${offset}`);
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ 
        error: 'Query parameter is required',
        message: 'Please provide a search query'
      });
    }
    
    // API returns max 10 results, we'll make multiple calls if needed
    const response = await axios.get('https://api.api-ninjas.com/v1/exercises', {
      headers: { 'X-Api-Key': NINJA_API_KEY },
      params: { 
        name: query,
        offset: offset
      }
    });
    
    console.log(`Found ${response.data.length} exercises for "${query}"`);
    res.json(response.data);
    
  } catch (error) {
    console.error('Error searching exercises:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search exercises',
      message: error.message
    });
  }
});

// Proxy endpoint for exercises with images (default browse - get variety)
app.get('/api/exercises', async (req, res) => {
  try {
    console.log('Fetching exercises from API Ninjas...');
    
    // Fetch exercises from multiple muscle groups to get variety
    const muscleGroups = ['biceps', 'triceps', 'chest', 'back', 'shoulders', 'legs'];
    const allExercises = [];
    
    // Fetch exercises from each muscle group
    for (const muscle of muscleGroups) {
      try {
        const response = await axios.get('https://api.api-ninjas.com/v1/exercises', {
          headers: { 'X-Api-Key': NINJA_API_KEY },
          params: { muscle: muscle }
        });
        
        allExercises.push(...response.data);
        console.log(`Fetched ${response.data.length} ${muscle} exercises`);
      } catch (error) {
        console.error(`Error fetching ${muscle} exercises:`, error.message);
      }
    }
    
    console.log(`Total exercises fetched: ${allExercises.length}`);
    res.json(allExercises);
    
  } catch (error) {
    console.error('Error fetching exercises:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch exercises',
      message: error.message
    });
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

// Load exercise database on server start
loadExerciseDatabase();

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/exercises`);
  console.log(`Search endpoint: http://localhost:${PORT}/api/exercises/search?query=curl`);
});