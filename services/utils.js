// ADD TO services/utils.js

// Error handling and logging
function handleError(error, context) {
    console.error(`[${context}]:`, error);
    // You can add error reporting service here later if needed
}

// Safe number parsing with fallback
function parseNumber(value, fallback = 0) {
    const parsed = parseInt(value);
    return isNaN(parsed) ? fallback : parsed;
}

// Coin animation helper
function animateNumber(element, start, end, duration = 500) {
    if (!element) return;
    
    start = Number(start);
    end = Number(end);
    
    if (start === end) {
        element.textContent = end;
        return;
    }

    const difference = end - start;
    const frames = 30;
    const step = difference / frames;
    let current = start;
    let frameCount = 0;
    
    function updateNumber() {
        current += step;
        frameCount++;
        
        if (frameCount >= frames || 
            (step > 0 && current >= end) || 
            (step < 0 && current <= end)) {
            element.textContent = Math.round(end);
            return;
        }
        
        element.textContent = Math.round(current);
        requestAnimationFrame(updateNumber);
    }
    
    requestAnimationFrame(updateNumber);
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `game-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    requestAnimationFrame(() => notification.classList.add('show'));
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Input validation
function sanitizeInput(input) {
    return input
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 500);
}

// Random name generator for guest users
function getRandomSimploName() {
    const names = [
        'Simplosaurus', 'Simplodian', 'Simpleton', 'Simplonius', 'Simplomancer',
        'Simplonaut', 'Simplobot', 'Simplozilla', 'Simplopedia', 'Simplotron',
        'Simplodex', 'Simplomatic', 'Simplomobile', 'Simplocopter', 'Simplonium',
        'Simplotastic', 'Simplominator', 'Simploverse', 'Simplonado', 'Simplophant'
    ];
    return names[Math.floor(Math.random() * names.length)];
}

// User limits management
function getUserLimits(userStatus = 'unregistered') {
    const limits = {
        unregistered: {
            maxLists: 3,
            maxWords: 10,
            maxPlays: 5,
            canShare: false
        },
        free: {
            maxLists: 5,
            maxWords: 20,
            maxPlays: 10,
            canShare: false
        },
        pending: {
            maxLists: 30,
            maxWords: 50,
            maxPlays: Infinity,
            canShare: false
        },
        premium: {
            maxLists: 50,
            maxWords: 200,
            maxPlays: Infinity,
            canShare: true
        }
    };

    return limits[userStatus] || limits.unregistered;
}

// File operations
async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Performance monitoring
const Performance = {
    marks: {},
    
    start(label) {
        this.marks[label] = performance.now();
    },
    
    end(label) {
        if (!this.marks[label]) return 0;
        const duration = performance.now() - this.marks[label];
        delete this.marks[label];
        return Math.round(duration);
    }
};

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('visible');
    }
}

// Export all utilities
export {
    handleError,
    parseNumber,
    animateNumber,
    showNotification,
    sanitizeInput,
    getRandomSimploName,
    getUserLimits,
    readFileAsText,
    Performance,
    showScreen
};