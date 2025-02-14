// Wordcraft List Management Module

const wordcraftLists = {
    lists: [],
    currentList: null,
    maxLists: 5
};

function getUserListLimits() {
    if (!currentUser) {
        return {
            maxLists: 3,
            maxWords: 10,
            maxPlays: 5,
            canShare: false
        };
    }

    const userStatus = currentUser.status || 'unregistered';
    
    switch(userStatus) {
        case 'free':
            return {
                maxLists: 5,
                maxWords: 20,
                maxPlays: 10,
                canShare: false
            };
        case 'pending':
            return {
                maxLists: 30,
                maxWords: 50,
                maxPlays: Infinity,
                canShare: false
            };
        case 'premium':
            return {
                maxLists: 50,
                maxWords: 200,
                maxPlays: Infinity,
                canShare: true
            };
        default:
            return {
                maxLists: 3,
                maxWords: 10,
                maxPlays: 5,
                canShare: false
            };
    }
}

function addWordcraftWordList(name = null) {
    const limits = getUserListLimits();
    
    if (wordcraftLists.lists.length >= limits.maxLists) {
        showNotification(`Maximum ${limits.maxLists} lists allowed.`, 'error');
        return null;
    }

    name = name || `List ${wordcraftLists.lists.length + 1}`;

    const newList = {
        id: Date.now(),
        name: name,
        words: [],
        translations: []
    };

    wordcraftLists.lists.push(newList);
    saveWordcraftLists();
    return newList;
}

async function saveWordcraftLists() {
    if (!currentUser) {
        // Save to localStorage for guest users
        localStorage.setItem('simploxWordcraftLists', JSON.stringify(wordcraftLists.lists));
        return;
    }

    try {
        // Prepare lists for Supabase
        const listsToSave = wordcraftLists.lists.map(list => ({
            user_id: currentUser.id,
            name: list.name,
            words: list.words,
            translations: list.translations,
            status: 'active'
        }));

        const { data, error } = await supabaseClient
            .from('wordcraft_lists')
            .upsert(listsToSave)
            .select();

        if (error) throw error;

        // Update local lists with any server-generated IDs
        if (data) {
            wordcraftLists.lists = data.map(serverList => ({
                ...serverList,
                id: serverList.id || Date.now()
            }));
        }

        showNotification('Lists saved successfully', 'success');
    } catch (error) {
        console.error('Error saving lists:', error);
        showNotification('Failed to save lists', 'error');
    }
}

async function loadWordcraftLists() {
    if (!currentUser) {
        // Load from localStorage for guest users
        const savedLists = localStorage.getItem('simploxWordcraftLists');
        wordcraftLists.lists = savedLists ? JSON.parse(savedLists) : [];
        updateListsDisplay();
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('wordcraft_lists')
            .select('*')
            .eq('user_id', currentUser.id);

        if (error) throw error;

        wordcraftLists.lists = (data || []).map(list => ({
            id: list.id,
            name: list.name,
            words: list.words,
            translations: list.translations
        }));

        updateListsDisplay();
    } catch (error) {
        console.error('Error loading lists:', error);
        showNotification('Failed to load lists', 'error');
    }
}

function deleteWordcraftList(listId) {
    // Remove list from local array
    wordcraftLists.lists = wordcraftLists.lists.filter(l => l.id !== listId);
    
    // Remove play count tracking
    localStorage.removeItem(`listPlays_${listId}`);
    
    // Save updated lists
    saveWordcraftLists();
    
    // Refresh display
    showWordcraftListsManager();

    // If logged in, also delete from server
    if (currentUser) {
        supabaseClient
            .from('wordcraft_lists')
            .delete()
            .eq('id', listId)
            .then(({ error }) => {
                if (error) {
                    console.error('Server delete error:', error);
                    showNotification('Failed to delete list from server', 'error');
                }
            });
    }
}

// Placeholder functions (to be implemented or imported from other modules)
function showNotification(message, type) {
    console.log(`Notification: ${message} (${type})`);
}

function updateListsDisplay() {
    console.log('Updating lists display');
    // Implement list display update logic
}

function showWordcraftListsManager() {
    console.log('Showing Wordcraft lists manager');
    // Implement lists manager display logic
}

// Export to global scope for HTML access
window.addWordcraftWordList = addWordcraftWordList;
window.saveWordcraftLists = saveWordcraftLists;
window.loadWordcraftLists = loadWordcraftLists;
window.deleteWordcraftList = deleteWordcraftList;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadWordcraftLists();
});


        // Initialize Nhost
        const nhostClient = new NhostClient({
            subdomain: process.env.NHOST_SUBDOMAIN,
            region: process.env.NHOST_REGION
        });

        // Initialize State
        const sharedState = new SharedState();

        // Initialize Wordcraft
        document.addEventListener('DOMContentLoaded', async () => {
            await initializeWordcraft();
        });


        function startWordcraftListPractice(listId) {
    const list = WordcraftPracticeLists.lists.find(l => l.id === listId);
    if (!list) return;

    currentGame = {
        words: Array.isArray(list.words) ? list.words : [],
        translations: Array.isArray(list.translations) ? list.translations : [],
        currentIndex: 0,
        correctAnswers: 0,
        firstAttempt: true,
        isWordcraftPractice: true,
        startingCoins: gameState.coins,
        startingPerks: { ...gameState.perks },
        practiceState: {
            currentLevel: 1,
            words: Array.isArray(list.words) ? list.words : [],
            translations: Array.isArray(list.translations) ? list.translations : [],
            unlockedLevels: new Set([1]),
            progress: {},
            maxLevel: 10,
            listId: listId
        }
    };

    startWordcraftLevel(1, currentGame.practiceState);
}

function startWordcraftLevel(levelId, practiceState) {
    const powerupsContainer = document.querySelector('.powerups-container');
if (powerupsContainer) {
    powerupsContainer.style.display = 'none';
}
    const levelData = calculateWordcraftLevelWords(levelId, practiceState);
    if (!levelData) return;

    currentGame = {
        words: levelData.words,
        translations: levelData.translations,
        currentIndex: 0,
        correctAnswers: 0,
        firstAttempt: true,
        isHebrewToEnglish: levelData.isTest ? Math.random() < 0.5 : false,
        mixed: levelData.isTest,
        speedChallenge: false,
        practiceState: practiceState,
        currentWordcraftLevel: levelId,
        isWordcraftPractice: true,
        startingCoins: gameState.coins,
        startingPerks: { ...gameState.perks },
        timeBonus: 0,
        initialTimeRemaining: null,
        streakBonus: true,
        levelStartTime: Date.now(),
        questionStartTime: 0,
        wrongStreak: 0,
        progressLost: 0
    };

    showLevelIntro(levelId, () => {
        showScreen('question-screen');
        updateProgressCircle();
        loadNextQuestion();
        startTimer(currentGame.words.length * 10); // 10 seconds per word
    });
}

function calculateWordcraftLevelWords(level, practiceState) {
    const { words, translations } = practiceState;
    
    const levelConfigs = {
        1: { start: 0, count: 3, isTest: false },
        2: { start: 3, count: 3, isTest: false },
        3: { start: 0, count: 6, isTest: true },
        4: { start: 6, count: 3, isTest: false },
        5: { start: 9, count: 3, isTest: false },
        6: { start: 6, count: 6, isTest: true },
        7: { start: 12, count: 4, isTest: false },
        8: { start: 16, count: 4, isTest: false },
        9: { start: 12, count: 8, isTest: true },
        10: { start: 0, count: 20, isTest: true, isFinal: true }
    };

    const config = levelConfigs[level];
    if (!config) return null;

    return {
        words: words.slice(config.start, config.start + config.count),
        translations: translations.slice(config.start, config.start + config.count),
        isTest: config.isTest,
        isFinal: config.isFinal
    };
}

function handleWordcraftPracticeCompletion() {
    const completedPerfectly = currentGame.streakBonus && 
        currentGame.correctAnswers === currentGame.words.length;

    if (completedPerfectly) {
        // Award coins
        if (currentGame.firstAttempt) {
            gameState.coins += 3;
            pulseCoins(3);
        } else {
            gameState.coins += 1;
            pulseCoins(1);
        }

        // Add completion bonus
        gameState.coins += 5;
        pulseCoins(5);
        
        updateAllCoinDisplays();
        saveProgress();
        
        const nextLevel = currentGame.currentWordcraftLevel + 1;
        if (nextLevel <= 10) {
            currentGame.practiceState.unlockedLevels.add(nextLevel);
            currentGame.practiceState.progress[currentGame.currentWordcraftLevel] = true;
            
            // Show completion curtain before next level
            showLevelIntro(nextLevel, () => {
                startWordcraftLevel(nextLevel, currentGame.practiceState);
            });
        } else {
            showScreen('Wordcraft-practice-screen');
            alert('Congratulations! Practice set completed!');
        }
    } else {
        startWordcraftLevel(currentGame.currentWordcraftLevel, currentGame.practiceState);
    }
}


        function addWordcraftWordList(name = null) {
    // Check if we've reached the maximum number of lists
    if (WordcraftPracticeLists.lists.length >= WordcraftPracticeLists.maxLists) {
        alert(`You can only create up to ${WordcraftPracticeLists.maxLists} Wordcraft lists.`);
        return null;
    }

    // Generate a default name if not provided
    if (!name) {
        name = `List ${WordcraftPracticeLists.lists.length + 1}`;
    }

    const newList = {
        id: Date.now(),
        name: name,
        words: [],
        translations: []
    };

    WordcraftPracticeLists.lists.push(newList);
    saveWordcraftLists();
    return newList;
}

function processWordcraftWords() {
    const wordInput = document.getElementById('Wordcraft-word-input');
    const translationResults = document.getElementById('translation-results');
    const wordList = document.getElementById('word-translation-list');
    const limits = getUserListLimits();
    const rawInput = wordInput.value.trim();
    
    if (!rawInput) {
        showNotification('Please enter at least one word.', 'error');
        return;
    }

    // Parse input based on format
    let words = rawInput.includes(',') ?
        rawInput.split(',').map(word => word.trim()) :
        rawInput.split(/\s+/).filter(word => word.length > 0);

    // Handle phrase entries properly
    words = words.map(word => word.includes(' ') ? [word] : word.split(/\s+/)).flat();

    // Apply limits
    const maxWords = currentUser ? limits.maxWords : 10;
    if (words.length > maxWords) {
        showNotification(`Maximum ${maxWords} words allowed.`, 'error');
        words = words.slice(0, maxWords);
    }

    // Clear and prepare container
    wordList.innerHTML = '';
    translationResults.style.display = 'block';

    // Process and create word items
    words.forEach(word => {
        const foundTranslation = findTranslation(word);
        const wordItem = createWordItem(word, foundTranslation);
        wordList.appendChild(wordItem);
        initializeDragAndDrop(wordItem);
    });

    makeWordListDraggable();
}

async function saveWordcraftList() {
    const listNameInput = document.getElementById('Wordcraft-list-name');
    const name = listNameInput.value.trim() || `List ${WordcraftPracticeLists.lists.length + 1}`;
    
    const wordItems = document.querySelectorAll('.word-translation-item');
    const words = [];
    const translations = [];
    
    wordItems.forEach(item => {
        const englishWord = item.querySelector('.source-word').textContent.trim();
        const hebrewTranslation = item.querySelector('.target-word').value.trim();
        
        if (englishWord && hebrewTranslation) {
            words.push(englishWord);
            translations.push(hebrewTranslation);
        }
    });

    const newList = {
        id: WordcraftPracticeLists.currentList ? WordcraftPracticeLists.currentList.id : Date.now(),
        name: name,
        words: words,
        translations: translations
    };

    // If we're editing an existing list, replace it
    if (WordcraftPracticeLists.currentList) {
        const index = WordcraftPracticeLists.lists.findIndex(l => l.id === WordcraftPracticeLists.currentList.id);
        if (index !== -1) {
            WordcraftPracticeLists.lists[index] = newList;
        } else {
            WordcraftPracticeLists.lists.push(newList);
        }
    } else {
        WordcraftPracticeLists.lists.push(newList);
    }
    
    // Reset current list
    WordcraftPracticeLists.currentList = null;
    
    // Save to Supabase if logged in
    if (currentUser) {
        await saveWordcraftListToSupabase(newList);
    } else {
        // Save to localStorage for guest users
        localStorage.setItem('simploxWordcraftLists', JSON.stringify(WordcraftPracticeLists.lists));
    }

    // Update UI after saving
    showWordcraftListsManager();
}

async function loadWordcraftLists() {
    if (currentUser) {
        const { data, error } = await supabaseClient
            .from('wordcraft_lists')
            .select('*')
            .or(`user_id.eq.${currentUser.id},shared_with.cs.{${currentUser.id}}`);

        if (error) {
            console.error('Error loading Wordcraft lists:', error);
            WordcraftPracticeLists.lists = [];
        } else {
            WordcraftPracticeLists.lists = data.map(item => ({
                id: item.local_id || Date.now(),
                supabaseId: item.id,
                name: item.name,
                words: item.words,
                translations: item.translations,
                is_shared: item.is_shared,
                shared_by: item.shared_by
            }));
        }
    } else {
        const savedLists = localStorage.getItem('simploxWordcraftLists');
        WordcraftPracticeLists.lists = savedLists ? JSON.parse(savedLists) : [];
    }
    
    updateListsDisplay();
}

function deleteWordcraftList(listId) {
    // Ensure listId is a number
    listId = typeof listId === 'string' ? parseInt(listId) : listId;

    // Remove from lists array
    WordcraftPracticeLists.lists = WordcraftPracticeLists.lists.filter(l => l.id !== listId);
    
    // Remove play count from localStorage
    localStorage.removeItem(`listPlays_${listId}`);
    
    // Update localStorage with remaining lists
    localStorage.setItem('simploxWordcraftLists', JSON.stringify(WordcraftPracticeLists.lists));
    
    // Refresh the lists display
    showWordcraftListsManager();
}

function addWordToList(listId) {
    const listElement = document.getElementById(`list-${listId}`);
    const listItem = document.querySelector(`.Wordcraft-list-item:has([data-list-id="${listId}"])`);
    const editButton = listItem.querySelector('.edit-button');
    
    // Only add word if in edit mode
    if (editButton.textContent !== 'Save') return;

    const wordItem = document.createElement('div');
    wordItem.className = 'word-translation-item';
    wordItem.draggable = true;
    
    wordItem.innerHTML = `
        <div class="drag-handle">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <span class="source-word" contenteditable="true"></span>
        <input type="text" class="target-word" placeholder="Hebrew translation">
        <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
    `;
    
    // Add at the top of the list
    if (listElement.firstChild) {
        listElement.insertBefore(wordItem, listElement.firstChild);
    } else {
        listElement.appendChild(wordItem);
    }
    
    // Make the new item draggable
    initializeDragAndDrop(wordItem);
    
    // Focus on the new word input
    const sourceWord = wordItem.querySelector('.source-word');
    sourceWord.focus();
}

function editWordcraftList(listId) {
    // Ensure listId is a number
    listId = typeof listId === 'string' ? parseInt(listId) : listId;
    
    const listItem = document.querySelector(`.Wordcraft-list-item[data-list-id="${listId}"]`);
    const editButton = listItem.querySelector('.edit-button');
    const wordList = document.getElementById(`list-${listId}`);
    
    // If currently in edit mode, save the list
    if (editButton.textContent === 'Save') {
        saveCurrentList();
        editButton.textContent = 'Edit';
        listItem.removeAttribute('data-in-edit-mode');
        wordList.innerHTML = '';
        showWordcraftListsManager();
        return;
    }
    
    const list = WordcraftPracticeLists.lists.find(l => l.id === listId);
    if (!list) return;
    
    // Switch to Wordcraft practice screen
    showScreen('Wordcraft-practice-screen');
    
    // Set the list name
    const listNameInput = document.getElementById('Wordcraft-list-name');
    listNameInput.value = list.name;
    
    // Show translations section
    const translationResults = document.getElementById('translation-results');
    const editWordList = document.getElementById('word-translation-list');
    
    // Clear previous translations
    editWordList.innerHTML = '';
    
    // Create translation items for each word
    list.words.forEach((word, index) => {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-translation-item';
        wordItem.draggable = true;
        
        wordItem.innerHTML = `
            <div class="drag-handle">
                <i class="fas fa-grip-vertical"></i>
            </div>
            <span class="source-word" contenteditable="true">${word}</span>
            <input type="text" class="target-word" value="${list.translations[index]}" placeholder="Hebrew translation">
            <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
        `;
        
        editWordList.appendChild(wordItem);
    });
    
    translationResults.style.display = 'block';
    
    // Mark list as in edit mode
    listItem.setAttribute('data-in-edit-mode', 'true');
    
    // Change edit button text
    editButton.textContent = 'Save';
    
    // Store the current list for later saving
    WordcraftPracticeLists.currentList = list;
    
    // Initialize drag functionality
    makeWordListDraggable();
}

function makeWordListDraggable(listId) {
    const wordList = document.getElementById(`list-${listId}`);
    if (!wordList) return;
    
    // Add dragover event listener to the container
    wordList.addEventListener('dragover', e => {
        e.preventDefault();
        const draggable = wordList.querySelector('.dragging');
        if (!draggable) return;
        
        const afterElement = getDragAfterElement(wordList, e.clientY);
        if (afterElement) {
            wordList.insertBefore(draggable, afterElement);
        } else {
            wordList.appendChild(draggable);
        }
    });

    wordList.addEventListener('drop', e => {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        if (draggingElement) {
            draggingElement.style.opacity = '1';
            draggingElement.classList.remove('dragging');
        }
    });

    // Initialize drag events for all items
    const items = wordList.querySelectorAll('.word-translation-item');
    items.forEach(item => initializeDragAndDrop(item));
}

function setupWordListKeyNavigation() {
    const container = document.getElementById('word-translation-list');
    if (!container) return;
    
    container.addEventListener('keydown', (e) => {
        const currentItem = document.activeElement.closest('.word-translation-item');
        if (!currentItem) return;
        
        let targetElement;
        
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                targetElement = currentItem.previousElementSibling?.querySelector('.source-word');
                break;
            case 'ArrowDown':
                e.preventDefault();
                targetElement = currentItem.nextElementSibling?.querySelector('.source-word');
                break;
            case 'ArrowRight':
                e.preventDefault();
                targetElement = currentItem.querySelector('.target-word');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                targetElement = currentItem.querySelector('.source-word');
                break;
        }
        
        if (targetElement) {
            targetElement.focus();
        }
    });
}

// Call this when word list is populated
setupWordListKeyNavigation();

function showWordcraftListsManager() {
    showScreen('Wordcraft-practice-screen');
    
    const container = document.getElementById('Wordcraft-lists-container');
    if (!container) return;
    
    const limits = getUserListLimits();
    const userStatus = currentUser?.status || 'unregistered';
    
    container.innerHTML = '';
    
    if (WordcraftPracticeLists.lists.length === 0) {
        container.innerHTML = '<p style="color: white; text-align: center;">No Wordcraft lists created yet. Create your first list!</p>';
        return;
    }

    WordcraftPracticeLists.lists.forEach(list => {
        // Get play count
        const playCountKey = `listPlays_${list.id}`;
        const playsUsed = parseInt(localStorage.getItem(playCountKey) || '0');
        const playsLeft = limits.maxPlays - playsUsed;

        if (playsLeft <= 0) return;
        
        const listItem = document.createElement('div');
        listItem.className = `Wordcraft-list-item collapsed ${list.is_shared ? 'shared-list' : ''}`;
        listItem.dataset.listId = list.id;
        
        listItem.innerHTML = `
            <div class="list-actions">
                <button class="start-button practice-button">Practice</button>
                <button class="edit-button" data-list-id="${list.id}">Edit</button>
                <button class="start-button delete-button">Delete</button>
                ${userStatus === 'premium' ? `
                    <button class="share-button" onclick="showShareModal(${list.id})">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                ` : ''}
            </div>
            <div class="list-header">
                <h3>${list.name}</h3>
                <div class="list-summary">
                    <span>${list.words.length} words</span>
                    <span style="color: ${playsLeft <= 2 ? '#ff4444' : '#ffffff'}; margin-left: 1rem;">
                        ${limits.playDisplay}
                    </span>
                    <p class="word-preview">${list.words.slice(0,5).join(', ')}${list.words.length > 5 ? '...' : ''}</p>
                </div>
            </div>
        `;

        // Add event listeners with explicit function calls
        const practiceButton = listItem.querySelector('.practice-button');
        practiceButton.addEventListener('click', () => startWordcraftListPractice(list.id));

        const editButton = listItem.querySelector('.edit-button');
        editButton.addEventListener('click', () => {
            console.log('Edit button clicked for list:', list.id);
            editWordcraftList(list.id);
        });

        const deleteButton = listItem.querySelector('.delete-button');
        deleteButton.addEventListener('click', () => {
            console.log('Delete button clicked for list:', list.id);
            deleteWordcraftList(list.id);
        });

        const header = listItem.querySelector('.list-header');
        header.addEventListener('click', () => toggleListCollapse(list.id));

        container.appendChild(listItem);
    });
}

function showWordcraftListDropdown() {
    // Debug logs
    console.log('Current user:', currentUser);
    console.log('All Wordcraft lists:', WordcraftPracticeLists.lists);
    
    // Get teacher's lists, including both owned and shared
    const lists = WordcraftPracticeLists.lists.filter(list => 
        list.user_id === currentUser.id || 
        (list.shared_with && list.shared_with.includes(currentUser.id))
    );
    
    console.log('Filtered lists for teacher:', lists);
    
    // First load lists from Supabase
    supabaseClient
        .from('wordcraft_lists')
        .select('*')
        .or(`user_id.eq.${currentUser.id},shared_with.cs.{${currentUser.id}}`)
        .then(({ data, error }) => {
            if (error) {
                console.error('Error fetching lists:', error);
                return;
            }
            
            console.log('Lists from database:', data);
            
            const availableLists = data || [];
            showListsDropdown(availableLists);
        });
}

function initializeDragAndDrop(item) {
    if (!item) return;
    
    item.setAttribute('draggable', 'true');
    
    item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', ''); // Firefox compatibility
    });
    
    item.addEventListener('dragend', (e) => {
        e.stopPropagation();
        item.classList.remove('dragging');
    });
}

function getDragAfterElement(container, y) {
    const draggableItems = [...container.querySelectorAll('.word-translation-item:not(.dragging)')];
    
    return draggableItems.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function createWordItem(word, translation) {
    const item = document.createElement('div');
    item.className = 'word-translation-item';
    item.draggable = true;
    
    item.innerHTML = `
        <div class="drag-handle">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <span class="source-word" contenteditable="true">${word}</span>
        <input type="text" class="target-word" value="${translation}" placeholder="Hebrew translation">
        <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
    `;
    
    return item;
}

function createWordTranslationItem(word = '', translation = '', isEditable = false) {
    const wordList = document.getElementById('word-translation-list');
    const wordItem = document.createElement('div');
    wordItem.className = 'word-translation-item';
    wordItem.draggable = true;
    wordItem.innerHTML = `
        <div class="drag-handle">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <span class="source-word ${isEditable ? 'editable' : ''}" 
              contenteditable="${isEditable}">${word}</span>
        <input 
            type="text" 
            class="target-word ${isEditable ? 'editable' : ''}"
            value="${translation}" 
            data-original="${translation}"
            ${isEditable ? '' : 'readonly'}
            placeholder="Hebrew translation"
        >
        <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
    `;
    wordList.appendChild(wordItem);
}

function findTranslation(word) {
    for (const set in vocabularySets) {
        const index = vocabularySets[set].words.indexOf(word.toLowerCase());
        if (index !== -1) return vocabularySets[set].translations[index];
    }
    return '';
}

function toggleEditMode(listId) {
    // Convert listId to number if it's a string
    listId = typeof listId === 'string' ? parseInt(listId) : listId;

    const listItem = document.querySelector(`.Wordcraft-list-item[data-list-id="${listId}"]`);
    if (!listItem) return;

    const editButton = listItem.querySelector('.edit-button');
    if (!editButton) return;

    const wordList = document.getElementById(`list-${listId}`);
    
    if (editButton.textContent === 'Edit') {
        editButton.textContent = 'Save';
        listItem.classList.remove('collapsed');
        listItem.setAttribute('data-in-edit-mode', 'true');
        
        const list = WordcraftPracticeLists.lists.find(l => l.id === listId);
        if (!list) return;

        wordList.innerHTML = '';
        
        list.words.forEach((word, index) => {
            const wordItem = document.createElement('div');
            wordItem.className = 'word-translation-item';
            wordItem.draggable = true;
            
            wordItem.innerHTML = `
                <div class="drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <span class="source-word" contenteditable="true">${word}</span>
                <input type="text" class="target-word" value="${list.translations[index]}" placeholder="Hebrew translation">
                <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
            `;
            
            wordList.appendChild(wordItem);
            initializeDragAndDrop(wordItem);
        });
        
        makeWordListDraggable(listId);
    } else {
        saveListChanges(listId, wordList, listItem);
    }
}

function saveListChanges(listId, wordList, listItem) {
    const list = WordcraftPracticeLists.lists.find(l => l.id === parseInt(listId));
    const editButton = listItem.querySelector('.edit-button');
    const items = wordList.querySelectorAll('.word-translation-item');
    
    const words = [];
    const translations = [];
    
    items.forEach(item => {
        const word = item.querySelector('.source-word').textContent.trim();
        const translation = item.querySelector('.target-word').value.trim();
        if (word && translation) {
            words.push(word);
            translations.push(translation);
        }
    });
    
    list.words = words;
    list.translations = translations;
    saveWordcraftLists();
    
    editButton.textContent = 'Edit';
    listItem.removeAttribute('data-in-edit-mode');
    listItem.classList.add('collapsed');
    
    const summary = listItem.querySelector('.list-summary');
    summary.innerHTML = `
        <span>${words.length} words</span>
        <p class="word-preview">${words.slice(0,5).join(', ')}${words.length > 5 ? '...' : ''}</p>
    `;
}
