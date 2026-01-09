// backend/db/populate.js
const axios = require('axios');
const Database = require('./database');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const NINJA_API_KEY = process.env.NINJA_API_KEY;
const API_URL = 'https://api.api-ninjas.com/v1/exercises';

// Verify API key is loaded
if (!NINJA_API_KEY) {
  console.error('❌ ERROR: NINJA_API_KEY not found in .env file!');
  process.exit(1);
}

console.log('✓ API Key loaded successfully');
console.log(`✓ API Key length: ${NINJA_API_KEY.length} characters\n`);

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
  const errors = [];
  const difficulties = ['beginner', 'intermediate', 'expert'];
  
  console.log('=== Starting Exercise Fetch from API Ninjas ===');
  console.log('ℹ️  Free tier limitation: 10 results per query (no offset support)\n');
  console.log('💡 Strategy: Fetch by muscle × difficulty combinations to maximize coverage\n');
  
  // Fetch by muscle groups × difficulty levels
  console.log('📋 Fetching by Muscle Groups × Difficulty Levels...\n');
  
  for (const muscle of MUSCLE_GROUPS) {
    console.log(`⏳ Fetching ${muscle} exercises...`);
    
    for (const difficulty of difficulties) {
      try {
        const response = await axios.get(API_URL, {
          headers: { 'X-Api-Key': NINJA_API_KEY },
          params: { 
            muscle,
            difficulty
          }
        });
        
        let newExercises = 0;
        response.data.forEach(exercise => {
          if (!allExercises.has(exercise.name)) {
            allExercises.set(exercise.name, exercise);
            newExercises++;
          }
        });
        
        console.log(`   ${difficulty}: ${response.data.length} fetched (${newExercises} new)`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        console.error(`   ❌ ${difficulty} error:`, error.response?.status, error.response?.statusText || error.message);
        errors.push({
          category: 'muscle',
          value: muscle,
          difficulty,
          status: error.response?.status,
          message: error.response?.statusText || error.message,
          data: error.response?.data
        });
      }
    }
    
    console.log(`   ✅ ${muscle} complete | Total unique: ${allExercises.size}\n`);
  }
  
  console.log('\n📋 Fetching by Exercise Types × Difficulty Levels...\n');
  
  // Also fetch by type × difficulty to catch more exercises
  for (const type of EXERCISE_TYPES) {
    console.log(`⏳ Fetching ${type} exercises...`);
    
    for (const difficulty of difficulties) {
      try {
        const response = await axios.get(API_URL, {
          headers: { 'X-Api-Key': NINJA_API_KEY },
          params: { 
            type,
            difficulty
          }
        });
        
        let newExercises = 0;
        response.data.forEach(exercise => {
          if (!allExercises.has(exercise.name)) {
            allExercises.set(exercise.name, exercise);
            newExercises++;
          }
        });
        
        console.log(`   ${difficulty}: ${response.data.length} fetched (${newExercises} new)`);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        console.error(`   ❌ ${difficulty} error:`, error.response?.status, error.response?.statusText || error.message);
        errors.push({
          category: 'type',
          value: type,
          difficulty,
          status: error.response?.status,
          message: error.response?.statusText || error.message,
          data: error.response?.data
        });
      }
    }
    
    console.log(`   ✅ ${type} complete | Total unique: ${allExercises.size}\n`);
  }
  
  console.log('\n=== Fetch Summary ===');
  console.log(`✅ Total unique exercises found: ${allExercises.size}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errors occurred during fetch:\n`);
    errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err.category}: ${err.value}`);
      console.log(`   Status: ${err.status || 'N/A'}`);
      console.log(`   Message: ${err.message}`);
      if (err.offset !== undefined) {
        console.log(`   Offset: ${err.offset}`);
      }
      if (err.data) {
        console.log(`   Response data:`, JSON.stringify(err.data, null, 2));
      }
      console.log('');
    });
  } else {
    console.log('✨ No errors during fetch!');
  }
  
  return Array.from(allExercises.values());
}

async function populateDatabase() {
  const db = new Database();
  
  try {
    console.log('\n=== Database Population Starting ===\n');
    
    // Connect to database
    await db.connect();
    
    // Initialize schema
    await db.initSchema();
    
    // Check if database already has data
    const existingCount = await db.getExerciseCount();
    if (existingCount > 0) {
      console.log(`\n⚠️  Database already contains ${existingCount} exercises.`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('Do you want to re-populate? This will add duplicates unless you clear first. (y/n): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log('❌ Aborted.');
        await db.close();
        return;
      }
    }
    
    // Fetch exercises from API
    const exercises = await fetchExercisesFromAPI();
    
    if (exercises.length === 0) {
      console.log('\n❌ No exercises were fetched. Please check the errors above.');
      await db.close();
      return;
    }
    
    // Insert exercises into database
    console.log('\n=== Inserting Exercises into Database ===\n');
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    
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
            console.log(`✓ Inserted ${inserted} exercises...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`❌ Error inserting "${exercise.name}":`, error.message);
        failed++;
      }
    }
    
    const finalCount = await db.getExerciseCount();
    
    console.log('\n=== 🎉 Database Population Complete! ===');
    console.log(`✅ Inserted: ${inserted} exercises`);
    console.log(`⏭️  Skipped (duplicates): ${skipped} exercises`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed} exercises`);
    }
    console.log(`📊 Total in database: ${finalCount} exercises\n`);
    
    await db.close();
    
  } catch (error) {
    console.error('\n❌ Fatal error populating database:', error);
    await db.close();
    process.exit(1);
  }
}

// Run the population script
if (require.main === module) {
  populateDatabase();
}

module.exports = { populateDatabase, fetchExercisesFromAPI };