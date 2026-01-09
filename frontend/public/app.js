// frontend/public/app.js

const API_URL = 'http://localhost:3000/api/exercises';
const SEARCH_API_URL = 'http://localhost:3000/api/exercises/search';
const IMAGE_API_URL = 'http://localhost:3000/api/exercise-image';

let allExercises = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let isSearchMode = false;
let currentSearchQuery = '';
let currentExercise = null;
let currentTab = 'all'; // Track current tab

// ========== FAVORITES MANAGEMENT ==========

async function toggleFavorite(exerciseId, event) {
    event.stopPropagation(); // Prevent card click
    
    // CRITICAL: Capture the button reference BEFORE any async operations
    const starButton = event.currentTarget;
    
    console.log(`=== Frontend: Toggling favorite for exercise ${exerciseId} ===`);
    
    try {
        // Call backend API to toggle favorite in database
        console.log('Sending PATCH request to:', `${API_URL}/${exerciseId}/favorite`);
        
        const response = await fetch(`${API_URL}/${exerciseId}/favorite`, {
            method: 'PATCH'
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                console.error('Failed to parse error response:', parseError);
                errorData = { error: 'Unknown error' };
            }
            console.error('Server returned error:', errorData);
            throw new Error(errorData.error || 'Failed to toggle favorite');
        }
        
        const updatedExercise = await response.json();
        console.log('Received updated exercise:', updatedExercise);
        
        // Update the star icon based on server response
        updateStarIcon(starButton, updatedExercise.is_favorited);
        
        // Update the exercise in our local array
        const exerciseIndex = allExercises.findIndex(ex => ex.id === exerciseId);
        if (exerciseIndex !== -1) {
            allExercises[exerciseIndex].is_favorited = updatedExercise.is_favorited;
            console.log('Updated local exercise array');
        }
        
        // If we're on the favorites tab, refresh the view
        if (currentTab === 'favorites') {
            console.log('Refreshing favorites view');
            displayFavorites();
        }
        
        console.log(`✓ Successfully toggled favorite for exercise ${exerciseId}: ${updatedExercise.is_favorited}`);
        console.log('===========================================\n');
        
    } catch (error) {
        console.error('❌ ERROR in toggleFavorite:', error);
        console.error('Error stack:', error.stack);
        alert('Failed to update favorite. Please try again.');
    }
}

function updateStarIcon(starButton, isFavorite) {
    if (!starButton) {
        console.error('Star button is null - cannot update icon');
        return;
    }
    starButton.textContent = isFavorite ? '★' : '☆';
    starButton.classList.toggle('favorited', isFavorite);
}

// ========== IMAGE FETCHING ==========

async function fetchImage(exerciseName) {
    try {
        const response = await fetch(`${IMAGE_API_URL}/${encodeURIComponent(exerciseName)}`);
        const data = await response.json();
        return data.images;
    } catch (error) {
        console.error(`Error fetching image for ${exerciseName}:`, error);
        return null;
    }
}

// ========== TAB SWITCHING ==========

function switchTab(tab) {
    currentTab = tab;
    currentPage = 1;
    
    // Update tab button styles
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tabButton => {
        if ((tab === 'all' && tabButton.textContent === 'All') || 
            (tab === 'favorites' && tabButton.textContent === 'Favorites')) {
            tabButton.classList.add('active');
        } else {
            tabButton.classList.remove('active');
        }
    });
    
    // Display appropriate content
    if (tab === 'all') {
        if (isSearchMode) {
            displayCurrentPage();
        } else {
            fetchExercises();
        }
    } else if (tab === 'favorites') {
        fetchFavorites();
    }
}

async function fetchFavorites() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const exercisesEl = document.getElementById('exercises');
    
    try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        exercisesEl.innerHTML = '';
        
        const response = await fetch(`${API_URL}/favorites`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch favorites');
        }
        
        const favorites = await response.json();
        allExercises = favorites; // Update allExercises with favorites
        
        loadingEl.style.display = 'none';
        
        if (favorites.length === 0) {
            exercisesEl.innerHTML = '<div class="no-results-message">No favorites yet. Click the star icon on exercises to add them to your favorites!</div>';
            document.getElementById('pagination').style.display = 'none';
            return;
        }
        
        displayCurrentPage();
        
    } catch (error) {
        console.error('Error fetching favorites:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

function displayFavorites() {
    // Just call fetchFavorites to get fresh data from backend
    fetchFavorites();
}

// ========== UI HELPERS ==========

function showSuccess(message) {
    const el = document.getElementById('successMessage');
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
    }, 3000);
}

function showListView() {
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('detailView').classList.remove('active');
    window.scrollTo(0, 0);
}

// ========== DETAIL VIEW ==========

function showDetailView(exercise) {
    currentExercise = exercise;
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailView').classList.add('active');
    
    const detailContent = document.getElementById('detailContent');
    
    detailContent.innerHTML = `
        <div class="detail-header">
            <h2 class="detail-title">${exercise.name}</h2>
            <div class="detail-actions">
                <button class="btn btn-primary" onclick="editExercise(${exercise.id})">Edit</button>
                <button class="btn btn-danger" onclick="confirmDelete(${exercise.id}, '${exercise.name.replace(/'/g, "\\'")}')">Delete</button>
            </div>
        </div>
        <div style="text-align: center; padding: 40px; color: #667eea;">
            Loading images...
        </div>
    `;
    
    fetchImage(exercise.name).then(images => {
        const imagesHtml = images && images.length > 0 
            ? `<div class="detail-images">
                ${images.map(img => `
                    <div class="detail-image">
                        <img src="${img}" alt="${exercise.name}">
                    </div>
                `).join('')}
               </div>`
            : '<p style="color: #999;">No images available for this exercise.</p>';
        
        detailContent.innerHTML = `
            <div class="detail-header">
                <h2 class="detail-title">${exercise.name}</h2>
                <div class="detail-actions">
                    <button class="btn btn-primary" onclick="editExercise(${exercise.id})">Edit</button>
                    <button class="btn btn-danger" onclick="confirmDelete(${exercise.id}, '${exercise.name.replace(/'/g, "\\'")}')">Delete</button>
                </div>
            </div>
            
            ${imagesHtml}
            
            <div class="detail-section">
                <h3>Exercise Details</h3>
                <div class="detail-info">
                    <div class="info-item">
                        <div class="info-label">Type</div>
                        <div class="info-value"><span class="tag">${exercise.type || 'N/A'}</span></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Muscle Group</div>
                        <div class="info-value">${exercise.muscle || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Equipment</div>
                        <div class="info-value">${exercise.equipment || 'None'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Difficulty</div>
                        <div class="info-value">
                            <span class="difficulty ${(exercise.difficulty || '').toLowerCase()}">${exercise.difficulty || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            ${exercise.instructions ? `
                <div class="detail-section">
                    <h3>Instructions</h3>
                    <p class="instructions-text">${exercise.instructions}</p>
                </div>
            ` : ''}
        `;
    });
    
    window.scrollTo(0, 0);
}

// ========== MODAL OPERATIONS ==========

function showCreateModal() {
    document.getElementById('modalTitle').textContent = 'Add New Exercise';
    document.getElementById('exerciseForm').reset();
    document.getElementById('exerciseId').value = '';
    document.getElementById('exerciseModal').classList.add('active');
}

async function editExercise(id) {
    try {
        const response = await fetch(`${API_URL}/${id}`);
        const exercise = await response.json();
        
        document.getElementById('modalTitle').textContent = 'Edit Exercise';
        document.getElementById('exerciseId').value = exercise.id;
        document.getElementById('exerciseName').value = exercise.name;
        document.getElementById('exerciseType').value = exercise.type;
        document.getElementById('exerciseMuscle').value = exercise.muscle;
        document.getElementById('exerciseEquipment').value = exercise.equipment;
        document.getElementById('exerciseDifficulty').value = exercise.difficulty;
        document.getElementById('exerciseInstructions').value = exercise.instructions;
        
        document.getElementById('exerciseModal').classList.add('active');
    } catch (error) {
        alert('Error loading exercise: ' + error.message);
    }
}

async function saveExercise(event) {
    event.preventDefault();
    
    const id = document.getElementById('exerciseId').value;
    const data = {
        name: document.getElementById('exerciseName').value,
        type: document.getElementById('exerciseType').value,
        muscle: document.getElementById('exerciseMuscle').value,
        equipment: document.getElementById('exerciseEquipment').value,
        difficulty: document.getElementById('exerciseDifficulty').value,
        instructions: document.getElementById('exerciseInstructions').value
    };
    
    try {
        const url = id ? `${API_URL}/${id}` : API_URL;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save exercise');
        }
        
        closeModal();
        showSuccess(id ? 'Exercise updated successfully!' : 'Exercise created successfully!');
        
        // Refresh the list based on current tab
        if (currentTab === 'favorites') {
            fetchFavorites();
        } else {
            fetchExercises();
        }
        
    } catch (error) {
        alert('Error saving exercise: ' + error.message);
    }
}

function confirmDelete(id, name) {
    if (confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
        deleteExercise(id);
    }
}

async function deleteExercise(id) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete exercise');
        }
        
        showSuccess('Exercise deleted successfully!');
        showListView();
        
        // Refresh based on current tab
        if (currentTab === 'favorites') {
            fetchFavorites();
        } else {
            fetchExercises();
        }
        
    } catch (error) {
        alert('Error deleting exercise: ' + error.message);
    }
}

function closeModal() {
    document.getElementById('exerciseModal').classList.remove('active');
}

// ========== LIST DISPLAY ==========

function displayExercises(exercises) {
    const exercisesEl = document.getElementById('exercises');
    exercisesEl.innerHTML = '';
    
    if (exercises.length === 0) {
        exercisesEl.innerHTML = '<div class="no-results-message">No exercises found. Try a different search.</div>';
        return;
    }
    
    exercises.forEach(async (exercise) => {
        const card = document.createElement('div');
        card.className = 'exercise-card';
        
        const isFavorite = exercise.is_favorited;
        
        card.innerHTML = `
            <button class="star-button ${isFavorite ? 'favorited' : ''}" onclick="toggleFavorite(${exercise.id}, event)">
                ${isFavorite ? '★' : '☆'}
            </button>
            <div class="card-content" onclick="showDetailView(${JSON.stringify(exercise).replace(/"/g, '&quot;')})">
                <div class="image-placeholder">💪</div>
                <div class="exercise-card-title">${exercise.name || 'Unnamed Exercise'}</div>
            </div>
        `;
        
        exercisesEl.appendChild(card);
        
        const images = await fetchImage(exercise.name);
        const placeholder = card.querySelector('.image-placeholder');
        
        if (images && images.length > 0) {
            placeholder.innerHTML = `<img src="${images[0]}" alt="${exercise.name}">`;
            placeholder.className = 'exercise-image-container';
        }
    });
}

// ========== PAGINATION ==========

function updatePagination() {
    const totalPages = Math.ceil(allExercises.length / ITEMS_PER_PAGE);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
    document.getElementById('pagination').style.display = totalPages > 1 ? 'flex' : 'none';
}

function displayCurrentPage() {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageExercises = allExercises.slice(startIndex, endIndex);
    displayExercises(pageExercises);
    updatePagination();
}

function nextPage() {
    const totalPages = Math.ceil(allExercises.length / ITEMS_PER_PAGE);
    if (currentPage < totalPages) {
        currentPage++;
        displayCurrentPage();
        window.scrollTo(0, 0);
    }
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        displayCurrentPage();
        window.scrollTo(0, 0);
    }
}

// ========== SEARCH ==========

function toggleClearButton() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    document.getElementById('searchInfo').textContent = '';
    fetchExercises();
}

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        fetchExercises();
        return;
    }
    
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const searchInfo = document.getElementById('searchInfo');
    
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    document.getElementById('exercises').innerHTML = '';
    
    try {
        isSearchMode = true;
        currentSearchQuery = query;
        currentPage = 1;
        
        const response = await fetch(`${SEARCH_API_URL}?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        allExercises = await response.json();
        loadingEl.style.display = 'none';
        
        searchInfo.textContent = `Found ${allExercises.length} result(s) for "${query}"`;
        
        displayCurrentPage();
        
    } catch (error) {
        console.error('Error searching exercises:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

// ========== DATA FETCHING ==========

async function fetchExercises() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const searchInfo = document.getElementById('searchInfo');
    
    isSearchMode = false;
    currentPage = 1;
    document.getElementById('searchInput').value = '';
    searchInfo.textContent = '';
    
    try {
        loadingEl.style.display = 'block';
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        allExercises = await response.json();
        loadingEl.style.display = 'none';
        
        displayCurrentPage();
        
    } catch (error) {
        console.error('Error fetching exercises:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

// ========== INITIALIZATION ==========

// Load default exercises on page load
fetchExercises();