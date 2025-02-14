






















async function showArcadeModal() {
    const modal = document.getElementById('arcade-modal');
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');

    try {
        if (currentUser) {
            const { data: profile } = await supabaseClient
                .from('user_profiles')
                .select('role')
                .eq('id', currentUser.id)
                .single();

            if (profile?.role === 'teacher') {
                // Generate OTP
                const otp = Math.floor(1000 + Math.random() * 9000).toString();

                // Store in session
                currentArcadeSession.otp = otp;
                currentArcadeSession.teacherId = currentUser.id;
                currentArcadeSession.participants = [];
                currentArcadeSession.isInitialized = false;

                // Create channel
                window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`, {
                    config: { broadcast: { self: true } }
                });

                // Set up channel listeners
                window.arcadeChannel
                    .on('broadcast', { event: 'player_join' }, ({ payload }) => {
                        console.log('Player join event received:', payload);
                        if (!currentArcadeSession.participants.find(p => p.username === payload.username)) {
                            currentArcadeSession.participants.push({
                                username: payload.username,
                                wordsCompleted: 0,
                                coins: 0
                            });

                            // Update both player count and leaderboard
                            document.getElementById('player-count').textContent = 
                                currentArcadeSession.participants.length;

                            // Update leaderboard if visible
                            const leaderboard = document.getElementById('arcade-leaderboard');
                            if (leaderboard && leaderboard.offsetParent !== null) {
                                updateAllPlayersProgress();
                            }
                        }
                    })
                    .subscribe();

                // Insert before stage selector
                const stageSelector = teacherView.querySelector('.stage-selector');
                if (stageSelector) {
                    teacherView.insertBefore(WordcraftListsSection, stageSelector);
                    
                    // Handle add list button
                    const addListButton = wordcraftListsSection.querySelector('.add-list-button');
                    if (addListButton) {
                        addListButton.onclick = showWordcraftListDropdown;
                    }
                }

                document.getElementById('otp').textContent = otp;
                teacherView.style.display = 'block';
                playerView.style.display = 'none';

            } else {
                teacherView.style.display = 'none';
                playerView.style.display = 'block';
            }
        } else {
            teacherView.style.display = 'none';
            playerView.style.display = 'block';
        }

        modal.style.display = 'block';

    } catch (error) {
        console.error('Arcade setup error:', error);
        alert('Failed to initialize arcade');
    }
}

async function initializeArcade() {
    try {
        const initButton = document.querySelector('.initialize-button');
        const endButton = document.querySelector('.end-arcade-button');
        
        initButton.style.display = 'none';
        endButton.classList.add('visible');
        
        currentArcadeSession.state = 'active';  // Update state
        
        // Signal all participants to start
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_playing',
            payload: {
                wordPool: currentArcadeSession.wordPool,
                wordGoal: currentArcadeSession.wordGoal,
                state: 'active'
            }
        });

    } catch (error) {
        console.error('Initialize error:', error);
        alert('Failed to start game');
    }
}

function showModeratorScreen() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    // Show moderator screen
    const moderatorScreen = document.getElementById('moderator-screen');
    moderatorScreen.classList.add('visible');
    
    // Display OTP and generate QR
    const otpDisplay = document.getElementById('moderatorOtp');
    if (otpDisplay && currentArcadeSession.otp) {
        otpDisplay.textContent = currentArcadeSession.otp;
        
        // Generate QR code with proper URL construction
        const currentUrl = window.location.origin + window.location.pathname;
        const joinUrl = `${currentUrl}#join=${currentArcadeSession.otp}`;
        console.log('QR URL generated:', joinUrl);
        
        new QRious({
            element: document.getElementById('qrCode'),
            value: joinUrl,
            size: 200,
            backgroundAlpha: 1,
            foreground: '#16213e',
            background: '#ffffff',
            level: 'H'
        });
        
        // Update all session info at once
        const now = new Date();
        const sessionInfo = {
            'sessionDate': now.toLocaleDateString(),
            'sessionStartTime': now.toLocaleTimeString(),
            'sessionWordGoal': currentArcadeSession.wordGoal,
            'activeParticipantCount': currentArcadeSession.participants.length
        };
        
        Object.entries(sessionInfo).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }
    
    initializeLeaderboard();
}

function initializeLeaderboard() {
    const leaderboard = document.getElementById('arcade-leaderboard');
    
    // Add header
    leaderboard.innerHTML = `
        <div class="leaderboard-header">
            <div>Rank</div>
            <div>Player</div>
            <div>Words</div>
            <div>Coins</div>
        </div>
    `;
    
    // Show any existing participants
    if (currentArcadeSession.participants.length > 0) {
        updateAllPlayersProgress();
    }
}

function updateAllPlayersProgress() {
    // Sort by words completed
    const sortedPlayers = [...currentArcadeSession.participants]
        .sort((a, b) => b.wordsCompleted - a.wordsCompleted);
    
    // Update leaderboard display
    const entries = sortedPlayers.map((player, index) => `
        <div class="leaderboard-entry ${index < 3 ? `rank-${index + 1}` : ''}"
             data-rank="${index + 1}">
            <div>${index + 1}</div>
            <div data-username="${player.username}">${player.username}</div>
            <div>${player.wordsCompleted || 0}</div>
            <div>${player.coins || 0}</div>
            <div class="player-actions">
                <button onclick="removePlayer('${player.username}')">Remove</button>
            </div>
        </div>
    `).join('');
    
    const leaderboard = document.getElementById('arcade-leaderboard');
    const header = leaderboard.querySelector('.leaderboard-header').outerHTML;
    leaderboard.innerHTML = header + entries;

    // Update session metadata
    document.getElementById('activeParticipantCount').textContent = sortedPlayers.length;
    document.getElementById('sessionDate').textContent = new Date().toLocaleDateString();
    document.getElementById('sessionStartTime').textContent = new Date().toLocaleTimeString();
    document.getElementById('sessionWordGoal').textContent = currentArcadeSession.wordGoal;
}

async function startArcade() {
    const selectedStages = Array.from(document.querySelectorAll('.stage-checkboxes input:checked'))
        .map(cb => parseInt(cb.value));
        
    if (selectedStages.length === 0) {
        document.querySelector('.stage-warning').style.display = 'block';
        return;
    }

    currentArcadeSession.wordPool = generateWordPool(selectedStages);
    currentArcadeSession.wordGoal = parseInt(document.getElementById('wordGoal').value);
    currentArcadeSession.state = 'started';  // Update state

    // Add channel subscriptions for progress updates
    window.arcadeChannel
        .on('broadcast', { event: 'progress_update' }, ({ payload }) => {
            updatePlayerProgress(payload);
            checkGameEnd();
        })
        .on('broadcast', { event: 'check_game_status' }, async ({ payload }) => {
            // Respond with current state
            await window.arcadeChannel.send({
                type: 'broadcast',
                event: 'game_state_response',
                payload: {
                    state: currentArcadeSession.state,
                    wordPool: currentArcadeSession.wordPool,
                    wordGoal: currentArcadeSession.wordGoal
                }
            });
        });

    // Hide modal, show moderator screen
    document.getElementById('arcade-modal').style.display = 'none';
    showModeratorScreen();
}

async function joinArcade() {
    const otp = document.getElementById('otpInput').value.trim().toUpperCase();
    
    try {
        window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`);
        
        const playerName = currentUser ? 
            currentUser.user_metadata?.username : 
            getRandomSimploName();
            
        currentArcadeSession.playerName = playerName;
        
        // Set up state polling
        let stateCheckInterval;
        
        window.arcadeChannel
        .on('broadcast', { event: 'game_end' }, ({ payload }) => {
            handleGameEnd(payload);
                currentArcadeSession.state = payload.state;
                
                if (payload.state === 'active') {
                    currentArcadeSession.wordPool = payload.wordPool;
                    currentArcadeSession.wordGoal = payload.wordGoal;
                    startArcadeGame();
                    if (stateCheckInterval) clearInterval(stateCheckInterval);
                }
            })
            .on('broadcast', { event: 'game_playing' }, ({ payload }) => {
                if (payload.state === 'active') {
                    currentArcadeSession.wordPool = payload.wordPool;
                    currentArcadeSession.wordGoal = payload.wordGoal;
                    startArcadeGame();
                    if (stateCheckInterval) clearInterval(stateCheckInterval);
                }
            })
            .subscribe();

        // Broadcast join
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_join',
            payload: {
                username: playerName,
                joinedAt: new Date().toISOString()
            }
        });

        // Hide arcade modal and show waiting screen
        document.getElementById('arcade-modal').style.display = 'none';
        showWaitingScreen();

        // Start state polling for late joiners
        stateCheckInterval = setInterval(async () => {
            await window.arcadeChannel.send({
                type: 'broadcast',
                event: 'check_game_status'
            });
        }, 2000);

        // Clear interval after 5 minutes to prevent indefinite polling
        setTimeout(() => {
            if (stateCheckInterval) clearInterval(stateCheckInterval);
        }, 300000);

    } catch (error) {
        console.error('Join error:', error);
        alert('Failed to join arcade');
    }
}

function showJoinButton() {
    const joinButton = document.getElementById('joinGameButton');
    if (joinButton) {
        joinButton.style.display = 'block';
        joinButton.textContent = 'Join Active Game';
    }
}

async function joinArcadeWithUsername() {
    const usernameInput = document.getElementById('arcadeUsername');
    const otpInput = document.getElementById('otpInput');
    const username = usernameInput.value.trim();
    const otp = otpInput.value.trim();
    
    // Username validation
    if (!username || username.length < 2 || username.length > 15) {
        showErrorToast('Username must be between 2 and 15 characters');
        usernameInput.focus();
        return;
    }

    // Allow Hebrew, English, numbers, and some special characters
    const validUsernameRegex = /^[a-zA-Z0-9\u0590-\u05FF\s._-]+$/;
    if (!validUsernameRegex.test(username)) {
        showErrorToast('Username can contain letters, numbers, spaces, periods, underscores, and hyphens');
        usernameInput.focus();
        return;
    }
    
    // OTP validation
    if (!otp || otp.length !== 4 || !/^\d+$/.test(otp)) {
        showErrorToast('Please enter a valid 4-digit game code');
        otpInput.focus();
        return;
    }

    try {
        // Create Supabase channel for the specific arcade session
        window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`);
        
        // Set the player name for the current session
        currentArcadeSession.playerName = username;
        
        // Start state polling for late joiners
        let stateCheckInterval;
        
        // Set up channel listeners
        window.arcadeChannel
            .on('broadcast', { event: 'game_end' }, ({ payload }) => {
                handleGameEnd(payload);
                currentArcadeSession.state = payload.state;
                
                if (payload.state === 'active') {
                    currentArcadeSession.wordPool = payload.wordPool;
                    currentArcadeSession.wordGoal = payload.wordGoal;
                    startArcadeGame();
                    if (stateCheckInterval) clearInterval(stateCheckInterval);
                }
            })
            .on('broadcast', { event: 'game_playing' }, ({ payload }) => {
                if (payload.state === 'active') {
                    currentArcadeSession.wordPool = payload.wordPool;
                    currentArcadeSession.wordGoal = payload.wordGoal;
                    startArcadeGame();
                    if (stateCheckInterval) clearInterval(stateCheckInterval);
                }
            })
            .subscribe();

        // Broadcast player join event
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_join',
            payload: {
                username: username,
                joinedAt: new Date().toISOString()
            }
        });

        // Hide arcade modal 
        document.getElementById('arcade-modal').style.display = 'none';

        // Start state polling for late joiners
        stateCheckInterval = setInterval(async () => {
            await window.arcadeChannel.send({
                type: 'broadcast',
                event: 'check_game_status'
            });
        }, 2000);

        // Clear interval after 5 minutes to prevent indefinite polling
        setTimeout(() => {
            if (stateCheckInterval) clearInterval(stateCheckInterval);
        }, 300000);

        // Only show waiting screen if game hasn't started
        if (currentArcadeSession.state !== 'active') {
            showWaitingScreen();
        }

    } catch (error) {
        console.error('Join arcade error:', error);
        showErrorToast('Failed to join arcade. Please try again.');
    }
}

async function handleArcadeAnswer(isCorrect) {
    const now = Date.now();
    const lastAnswerTime = currentGame.lastAnswerTime || 0;
    
    // Enforce 1-second cooldown between answers
    if (now - lastAnswerTime < 1000) {
        return; // Ignore rapid clicks
    }
    
    currentGame.lastAnswerTime = now;
    
    const playerUsername = currentArcadeSession.playerName || 
        (currentUser?.user_metadata?.username || getRandomSimploName());
    
    let coinsChanged = false;
    
    if (isCorrect) {
        currentGame.wordsCompleted++;
        currentGame.correctStreak++;
        currentGame.wrongStreak = 0;
        
        // Award coins with streak bonus
        let coinsEarned = 5;
        if (currentGame.correctStreak >= 3) {
            coinsEarned += 5;
        }
        
        const oldCoins = currentGame.coins;
        currentGame.coins += coinsEarned;
        coinsChanged = true;
        
        // Animate coin changes
        const coinElement = document.querySelector('.coin-count');
        animateCoinsChange(coinElement, oldCoins, currentGame.coins);
        
        updateArcadeProgress();
        
    } else {
        currentGame.wrongStreak++;
        currentGame.correctStreak = 0;
        
        // Lose coins with streak penalty
        let coinsLost = 2;
        if (currentGame.wrongStreak >= 3) {
            coinsLost += 3;
        }
        
        const oldCoins = currentGame.coins;
        currentGame.coins = Math.max(0, currentGame.coins - coinsLost);
        coinsChanged = true;
        
        // Animate coin changes
        const coinElement = document.querySelector('.coin-count');
        animateCoinsChange(coinElement, oldCoins, currentGame.coins);
    }
    
    // Broadcast progress with updated coins
    if (window.arcadeChannel) {
        try {
            await window.arcadeChannel.send({
                type: 'broadcast',
                event: 'progress_update',
                payload: {
                    username: playerUsername,
                    wordsCompleted: currentGame.wordsCompleted,
                    coins: currentGame.coins,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error('Failed to broadcast progress:', error);
        }
    }
    
    if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
        await handleArcadeCompletion();
        return;
    }
    
    loadNextArcadeQuestion();
}

function updatePlayerProgress(payload) {
    const existingPlayerIndex = currentArcadeSession.participants.findIndex(
        p => p.username === payload.username
    );
    
    // Store old positions and values for animation
    const oldPositions = {};
    const oldValues = {};
    document.querySelectorAll('.leaderboard-entry').forEach(entry => {
        const username = entry.querySelector('[data-username]').dataset.username;
        oldPositions[username] = entry.getBoundingClientRect();
        
        const wordsElement = entry.querySelector('[data-words]');
        const coinsElement = entry.querySelector('[data-coins]');
        
        if (wordsElement) oldValues[username] = {
            words: parseInt(wordsElement.textContent),
            coins: parseInt(coinsElement.textContent)
        };
    });
    
    if (existingPlayerIndex !== -1) {
        currentArcadeSession.participants[existingPlayerIndex] = {
            ...currentArcadeSession.participants[existingPlayerIndex],
            ...payload
        };
    } else {
        currentArcadeSession.participants.push({
            username: payload.username,
            wordsCompleted: payload.wordsCompleted || 0,
            coins: payload.coins || 0
        });
    }
    
    // Sort and create new entries
    const sortedPlayers = [...currentArcadeSession.participants]
        .sort((a, b) => {
            if (b.wordsCompleted !== a.wordsCompleted) {
                return b.wordsCompleted - a.wordsCompleted;
            }
            return b.coins - a.coins;
        });
    
    const entries = sortedPlayers.map((player, index) => `
        <div class="leaderboard-entry ${index < 3 ? `rank-${index + 1}` : ''}"
             data-rank="${index + 1}">
            <div>${index + 1}</div>
            <div data-username="${player.username}">${player.username}</div>
            <div data-words="${player.wordsCompleted}">${player.wordsCompleted || 0}</div>
            <div data-coins="${player.coins}">${player.coins || 0}</div>
        </div>
    `).join('');
    
    const leaderboard = document.getElementById('arcade-leaderboard');
    leaderboard.innerHTML = leaderboard.querySelector('.leaderboard-header').outerHTML + entries;

    // Apply animations
    const newEntries = leaderboard.querySelectorAll('.leaderboard-entry');
    newEntries.forEach(entry => {
        const username = entry.querySelector('[data-username]').dataset.username;
        if (oldPositions[username]) {
            const oldPos = oldPositions[username];
            const newPos = entry.getBoundingClientRect();
            const diff = oldPos.top - newPos.top;
            
            if (diff > 0) {
                entry.classList.add('moving-up');
            } else if (diff < 0) {
                entry.classList.add('moving-down');
            }
            
            // Animate words and coins if values changed
            if (oldValues[username]) {
                const wordsElement = entry.querySelector('[data-words]');
                const coinsElement = entry.querySelector('[data-coins]');
                
                animateCoinsChange(
                    wordsElement, 
                    oldValues[username].words, 
                    parseInt(wordsElement.textContent)
                );
                
                animateCoinsChange(
                    coinsElement, 
                    oldValues[username].coins, 
                    parseInt(coinsElement.textContent)
                );
            }
            
            entry.addEventListener('animationend', () => {
                entry.classList.remove('moving-up', 'moving-down');
            }, { once: true });
        }
    });
}

function showWaitingScreen() {
    // First check if game is already active
    if (currentArcadeSession.state === 'active') {
        startArcadeGame();
        return;
    }

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    const waitingScreen = document.getElementById('waiting-screen');
    waitingScreen.classList.add('visible');
    
    const joinButton = document.getElementById('joinGameButton');
    if (joinButton) {
        joinButton.style.display = currentArcadeSession.state === 'active' ? 'block' : 'none';
    }
}

function handleGameEnd(payload) {
    console.log('Game End Payload:', payload);

    // If no payload or no participants, exit
    if (!payload || !payload.participants) return;

    // Determine if current user is a participant or moderator
    const playerUsername = currentUser?.user_metadata?.username || 
                           (currentUser?.id === payload.teacherId ? 'Moderator' : getRandomSimploName());

    // If moderator, just show welcome screen
    if (currentUser?.id === payload.teacherId) {
        showScreen('welcome-screen');
        return;
    }

    const playerData = payload.participants.find(p => p.username === playerUsername);

    if (!playerData) {
        console.warn('No player data found for:', playerUsername);
        showScreen('welcome-screen');
        return;
    }

    // Sort participants to get ranks
    const sortedPlayers = payload.participants
        .sort((a, b) => {
            if (b.wordsCompleted !== a.wordsCompleted) {
                return b.wordsCompleted - a.wordsCompleted;
            }
            return b.coins - a.coins;
        });
    
    playerData.rank = sortedPlayers.findIndex(p => p.username === playerUsername) + 1;
    
    // Create completion modal (same as previous implementation)
    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    overlay.innerHTML = `
        <div class="completion-modal-content">
            <h2>Arcade Session Complete!</h2>
            <div class="completion-stats">
                <div class="stat-item">
                    <i class="fas fa-language"></i>
                    <span>Words Learned</span>
                    <strong>${playerData.wordsCompleted || 0}</strong>
                </div>
                <div class="stat-item">
                    <i class="fas fa-coins"></i>
                    <span>Coins Earned</span>
                    <strong>${playerData.coins || 0}</strong>
                </div>
                <div class="stat-item">
                    <i class="fas fa-trophy"></i>
                    <span>Rank</span>
                    <strong>${playerData.rank || 'N/A'}</strong>
                </div>
            </div>
            <div class="leaderboard-preview">
                <h3>Top 3 Players</h3>
                ${sortedPlayers.slice(0, 3).map((player, index) => `
                    <div class="podium-player rank-${index + 1}">
                        <span class="player-name">${player.username}</span>
                        <span class="player-words">${player.wordsCompleted} words</span>
                    </div>
                `).join('')}
            </div>
            <button onclick="exitArcadeCompletion()" class="start-button">
                Return to Welcome
            </button>
        </div>
    `;
    
    // Make the modal closable by clicking anywhere
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            exitArcadeCompletion();
        }
    });
    
    document.body.appendChild(overlay);
    
    // Ensure the modal is visible
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });
}

function removePlayer(username) {
    // Remove player from current arcade session
    currentArcadeSession.participants = currentArcadeSession.participants.filter(
        player => player.username !== username
    );
    
    // Broadcast player removal
    if (window.arcadeChannel) {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_removed',
            payload: { username }
        });
    }
    
    // Update leaderboard
    updateAllPlayersProgress();
}

function createParticles(x, y, type) {
    const particleCount = 15;
    const colors = type === 'blessing' ? 
        ['#3498db', '#2980b9', '#1abc9c'] : 
        ['#e74c3c', '#c0392b', '#d35400'];
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = `particle ${type}`;
        
        const size = Math.random() * 8 + 4;
        const angle = (Math.random() * Math.PI * 2);
        const velocity = Math.random() * 100 + 50;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.borderRadius = '50%';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.position = 'fixed';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        document.body.appendChild(particle);
        
        const destinationX = x + Math.cos(angle) * velocity;
        const destinationY = y + Math.sin(angle) * velocity;
        
        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${destinationX - x}px, ${destinationY - y}px) scale(0)`, opacity: 0 }
        ], {
            duration: 1000,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }).onfinish = () => particle.remove();
    }
}

function createParticles(x, y) {
    // Detect mobile device
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    
    // Define particle parameters based on device type
    const particleConfig = isMobile 
        ? {
            count: 10,      // Fewer particles on mobile
            size: 6,        // Smaller particles
            distance: 50,   // Shorter spread
            opacity: 0.7,   // Lower opacity
            duration: 1000  // Shorter animation
        }
        : {
            count: 40,      // More particles on desktop
            size: 10,       // Standard particle size
            distance: 150,  // Wider spread
            opacity: 1,     // Full opacity
            duration: 1500  // Longer animation
        };

    const colors = ['#ffd700', '#FFA500', '#4CAF50', '#FFD700'];
    const container = document.body;
    
    for (let i = 0; i < particleConfig.count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Position relative to click point
        particle.style.position = 'fixed';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        // Randomize particle properties
        const angle = (Math.random() * Math.PI * 2);
        const distance = particleConfig.distance + (Math.random() * 50);
        
        particle.style.width = `${particleConfig.size}px`;
        particle.style.height = `${particleConfig.size}px`;
        particle.style.opacity = `${particleConfig.opacity}`;
        
        particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
        
        // Create adaptive animation
        particle.style.animation = `particleBurst ${particleConfig.duration / 1000}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
        
        container.appendChild(particle);
        
        // Remove particle after animation completes
        setTimeout(() => {
            container.removeChild(particle);
        }, particleConfig.duration);
    }
}

function generateQRCode(otp) {
    // Get the base URL without any parameters or hash
    const baseUrl = window.location.origin + window.location.pathname;
    const joinUrl = `${baseUrl}#join=${otp}`;
    
    // Add console logging for debugging
    console.log('Generating QR code with URL:', joinUrl);
    
    new QRious({
        element: document.getElementById('qrCode'),
        value: joinUrl,
        size: 200,
        backgroundAlpha: 1,
        foreground: '#16213e',
        background: '#ffffff',
        level: 'H'
    });
}

async function endArcade() {
    try {
        // Broadcast end game event to all participants
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_end',
            payload: {
                participants: currentArcadeSession.participants,
                teacherId: currentUser.id  // Add teacher ID to help identify moderator
            }
        });
        
        currentArcadeSession.isActive = false;
        
        // Clean up channel
        if (window.arcadeChannel) {
            window.arcadeChannel.unsubscribe();
        }
        
        // For the moderator, explicitly trigger game end
        handleGameEnd({
            participants: currentArcadeSession.participants,
            teacherId: currentUser.id
        });
        
    } catch (error) {
        console.error('End game error:', error);
        alert('Failed to end game');
    }
}

function initializePowerups() {
    const powerupPool = {
        highFive: {
            id: 'highFiveCard',
            cost: 30,
            effect: 50,
            type: 'goodie',
            icon: 'fa-hand-paper',
            name: 'High Five',
            message: 'high-fived'
        },
        fistBump: {
            id: 'fistBumpCard',
            cost: 40,
            effect: 75,
            type: 'goodie',
            icon: 'fa-fist-raised',
            name: 'Fist Bump',
            message: 'fist-bumped'
        },
        energyBoost: {
            id: 'energyBoostCard',
            cost: 45,
            type: 'goodie',
            icon: 'fa-bolt',
            name: 'Energy Boost',
            message: 'boosted'
        },
        freeze: {
            id: 'freezeCard',
            cost: 150,
            duration: 10000,
            type: 'baddie',
            icon: 'fa-snowflake',
            name: 'Freeze',
            message: 'froze'
        },
        coinStorm: {
            id: 'coinStormCard',
            cost: 160,
            type: 'baddie',
            icon: 'fa-cloud-showers-heavy',
            name: 'Coin Storm',
            message: 'cast a coin storm on'
        },
        screenShake: {
            id: 'screenShakeCard',
            cost: 130,
            duration: 5000,
            type: 'baddie',
            icon: 'fa-shake',
            name: 'Screen Shake',
            message: 'shook'
        }
    };

    function getRandomPowerups(count = 3) {
        const powerupKeys = Object.keys(powerupPool);
        const selectedKeys = [];
        while (selectedKeys.length < count && powerupKeys.length > 0) {
            const randomIndex = Math.floor(Math.random() * powerupKeys.length);
            selectedKeys.push(powerupKeys.splice(randomIndex, 1)[0]);
        }
        return selectedKeys;
    }

    function renderPowerups() {
        const container = document.querySelector('.powerups-container');
        if (!container) return;
        
        container.innerHTML = '';
        const selectedPowerups = getRandomPowerups(3);
        
        selectedPowerups.forEach(key => {
            const powerup = powerupPool[key];
            const card = document.createElement('div');
            card.className = `powerup-card ${powerup.type}`;
            card.id = powerup.id;
            
            card.innerHTML = `
                <i class="fas ${powerup.icon} powerup-icon"></i>
                <div class="powerup-name">${powerup.name}</div>
                <div class="powerup-cost">${powerup.cost}</div>
            `;
            
            card.onclick = async () => {
                console.log('Powerup clicked:', powerup.name); // Debug log
                
                if (currentGame.coins < powerup.cost) {
                    showNotification('Not enough coins!', 'error');
                    return;
                }
                
                // Change this section in the card.onclick function:
                const otherPlayers = currentArcadeSession.participants.filter(
            p => p.username !== currentArcadeSession.playerName && 
                 p.username !== undefined && 
                 p.username !== null
        );

        if (otherPlayers.length === 0) {
            showNotification('Waiting for other players to join...', 'info');
            return;
        }
                
                const targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                
                // Deduct coins immediately
                const oldCoins = currentGame.coins;
                currentGame.coins -= powerup.cost;
                
                // Update coins display
                document.querySelectorAll('.coin-count').forEach(display => {
                    display.textContent = currentGame.coins;
                });
                
                try {
                    // Send powerup effect
                    await window.arcadeChannel.send({
                        type: 'broadcast',
                        event: 'powerup_effect',
                        payload: {
                            powerupKey: key,
                            targetUser: targetPlayer.username,
                            fromUser: currentArcadeSession.playerName,
                            powerup: powerup
                        }
                    });
                    
                    // Show feedback
                    showNotification(`Used ${powerup.name} on ${targetPlayer.username}!`, powerup.type);
                    
                    // Update progress
                    await window.arcadeChannel.send({
                        type: 'broadcast',
                        event: 'progress_update',
                        payload: {
                            username: currentArcadeSession.playerName,
                            wordsCompleted: currentGame.wordsCompleted,
                            coins: currentGame.coins,
                            timestamp: Date.now()
                        }
                    });
                    
                    // Get new powerups
                    renderPowerups();
                    
                } catch (error) {
                    console.error('Powerup use error:', error);
                    // Revert coins if failed
                    currentGame.coins = oldCoins;
                    document.querySelectorAll('.coin-count').forEach(display => {
                        display.textContent = oldCoins;
                    });
                    showNotification('Failed to use powerup!', 'error');
                }
            };
            
            container.appendChild(card);
        });
        
        updatePowerupAvailability();
    }

    function updatePowerupAvailability() {
        document.querySelectorAll('.powerup-card').forEach(card => {
            const costElement = card.querySelector('.powerup-cost');
            if (!costElement) return;
            
            const cost = parseInt(costElement.textContent);
            const canAfford = currentGame.coins >= cost;
            
            card.classList.toggle('disabled', !canAfford);
            card.style.cursor = canAfford ? 'pointer' : 'not-allowed';
            card.style.opacity = canAfford ? '1' : '0.5';
        });
    }

    // Initialize first set of powerups
    renderPowerups();
    
    // Watch for coin changes
    const coinDisplay = document.querySelector('.coin-count');
    if (coinDisplay) {
        new MutationObserver(() => {
            updatePowerupAvailability();
        }).observe(coinDisplay, { childList: true, characterData: true, subtree: true });
    }
    
    // Initial availability check
    updatePowerupAvailability();
}

function startPlayerCounting(teacherId) {
    if (window.countInterval) clearInterval(window.countInterval);
    
    async function updateCount() {
        try {
            const { data } = await supabaseClient
                .from('game_progress')
                .select('arcade_session')
                .eq('user_id', teacherId)
                .single();
                
            if (data?.arcade_session?.participants) {
                document.getElementById('player-count').textContent = 
                    data.arcade_session.participants.length;
            }
        } catch (error) {
            console.error('Count update error:', error);
        }
    }
    
    updateCount();
    window.countInterval = setInterval(updateCount, 2000);
}

function checkGameEnd() {
    const completedPlayers = currentArcadeSession.participants
        .filter(p => p.wordsCompleted >= currentArcadeSession.wordGoal)
        .length;
        
    if (completedPlayers >= 3) {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_end'
        });
    }
}

function proceedToGame() {
    const qrLanding = document.getElementById('qr-landing');
    const otp = qrLanding.dataset.otp;
    
    // Hide landing page
    qrLanding.style.display = 'none';
    
    // Show join modal with OTP
    showJoinModal(otp);
}

function showJoinModal(otp = '') {
    console.log('Showing join modal with OTP:', otp);  // Add logging
    const modal = document.getElementById('arcade-modal');
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    const otpInput = document.getElementById('otpInput');
    
    if (modal) {
        modal.style.display = 'block';
        if (teacherView) teacherView.style.display = 'none';
        if (playerView) playerView.style.display = 'block';
        
        if (otpInput && otp) {
            otpInput.value = otp;
            // Focus username input if it exists
            const usernameInput = document.getElementById('arcadeUsername');
            if (usernameInput) {
                usernameInput.focus();
            }
        }
    }
}

function handleHashChange() {
    console.log('Hash change detected:', window.location.hash);
    
    if (window.location.hash.startsWith('#join=')) {
        const otp = window.location.hash.replace('#join=', '');
        console.log('Join OTP detected:', otp);
        
        // Show landing page on mobile
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            const qrLanding = document.getElementById('qr-landing');
            const codeDisplay = qrLanding.querySelector('.game-code-display');
            
            // Hide all other screens
            document.querySelectorAll('.screen').forEach(screen => {
                screen.style.display = 'none';
            });
            
            // Show and populate landing page
            qrLanding.style.display = 'flex';
            codeDisplay.textContent = otp;
            
            // Store OTP for later use
            qrLanding.dataset.otp = otp;
        } else {
            // Desktop behavior
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }
    }
}