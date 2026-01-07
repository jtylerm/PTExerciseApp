// backend/db/populate.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const Database = require('./database');

const NINJA_API_KEY = process.env.NINJA_API_KEY;
const API_URL = 'https://api.api-ninjas.com/v1/exercises';

// All muscle groups to fetch from
const MUSCLE_GROUPS = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest',
  'forearms', 'glutes', 'hamstrings', 'lats', 'lower_back', 'middle_back',
  'neck', 'quadriceps', 'traps', 'triceps', 'shoulders'
];

// All exercise types
const EXERCISE_TYPES = [
  'cardio', 'olympic_weightlifting', 'plyometrics', 'powerlifting',
  'strength', 'stretching', 'strongman'
];

async function fetchExercisesFromAPI() {
  const allExercises = new Map(); // Use Map to avoid duplicates by name
  
  console.log('Fetching exercises from API Ninjas...');
  
  // Fetch by muscle groups
  for (const muscle of MUSCLE_GROUPS) {
    try {
      console.log(`Fetching ${muscle} exercises...`);
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const response = await axios.get(API_URL, {
          headers: { 'X-Api-Key': NINJA_API_KEY },
          params: { muscle, offset }
        });
        
        if (response.data.length === 0) {
          hasMore = false;
        } else {
          response.data.forEach(exercise => {
            // Use name as key to avoid duplicates
            if (!allExercises.has(exercise.name)) {
              allExercises.set(exercise.name, exercise);
            }
          });
          
          offset += response.data.length;
          
          // API typically returns max 10 per request
          if (response.data.length < 10) {
            hasMore = false;
          }
        }
        
        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`Found ${allExercises.size} unique exercises so far...`);
    } catch (error) {
      console.error(`Error fetching ${muscle} exercises:`, error.message);
    }
  }
  
  // Also fetch by type to catch any exercises not categorized by muscle
  for (const type of EXERCISE_TYPES) {
    try {
      console.log(`Fetching ${type} exercises...`);
      const response = await axios.get(API_URL, {
        headers: { 'X-Api-Key': NINJA_API_KEY },
        params: { type, offset: 0 }
      });
      
      response.data.forEach(exercise => {
        if (!allExercises.has(exercise.name)) {
          allExercises.set(exercise.name, exercise);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error fetching ${type} exercises:`, error.message);
    }
  }
  
  console.log(`\nTotal unique exercises found: ${allExercises.size}`);
  return Array.from(allExercises.values());
}

async function populateDatabase() {
  const db = new Database();
  
  try {
    // Connect to database
    await db.connect();
    
    // Initialize schema
    await db.initSchema();
    
    // Check if database already has data
    const existingCount = await db.getExerciseCount();
    if (existingCount > 0) {
      console.log(`\nDatabase already contains ${existingCount} exercises.`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('Do you want to re-populate? This will add duplicates unless you clear first. (y/n): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        await db.close();
        return;
      }
    }
    
    // Fetch exercises from API
    const exercises = await fetchExercisesFromAPI();
    
    // Insert exercises into database
    console.log('\nInserting exercises into database...');
    let inserted = 0;
    let skipped = 0;
    
    for (const exercise of exercises) {
      try {
        // Check if exercise already exists
        const exists = await db.exerciseExists(exercise.name);
        
        if (!exists) {
          await db.createExercise({
            name: exercise.name,
            type: exercise.type || 'unknown',
            muscle: exercise.muscle || 'unknown',
            equipment: exercise.equipment || 'none',
            difficulty: exercise.difficulty || 'beginner',
            instructions: exercise.instructions || 'No instructions available'
          });
          inserted++;
          
          if (inserted % 50 === 0) {
            console.log(`Inserted ${inserted} exercises...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error inserting exercise "${exercise.name}":`, error.message);
      }
    }
    
    console.log(`\n✅ Database population complete!`);
    console.log(`   - Inserted: ${inserted} exercises`);
    console.log(`   - Skipped (duplicates): ${skipped} exercises`);
    console.log(`   - Total in database: ${await db.getExerciseCount()} exercises`);
    
    await db.close();
    
  } catch (error) {
    console.error('Error populating database:', error);
    await db.close();
    process.exit(1);
  }
}

// Run the population script
if (require.main === module) {
  populateDatabase();
}

module.exports = { populateDatabase, fetchExercisesFromAPI };