// PWA Support
let deferredPrompt;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Check if the app is already installed
function checkIfAppIsInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone || 
         localStorage.getItem('app_installed') === 'true';
}

// Initialize the app download button
function initializeAppDownloadButton() {
  const downloadAppButton = document.querySelector('.download-app-button');
  
  if (!downloadAppButton) return;
  
  // Check if app is already installed
  if (checkIfAppIsInstalled()) {
    downloadAppButton.style.display = 'none';
    return;
  }
  
  // Enable the button
  downloadAppButton.disabled = false;
  downloadAppButton.textContent = "Download the App";
  
  // Add click handler based on device type
  downloadAppButton.addEventListener('click', async () => {
    if (isIOS) {
      // On iOS, we must show instructions since there's no programmatic way to trigger install
      showIOSInstallInstructions();
    } else if (deferredPrompt) {
      // This is the key part - it triggers the native install prompt on Android/Chrome
      deferredPrompt.prompt();
      
      try {
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
          downloadAppButton.style.display = 'none';
          localStorage.setItem('app_installed', 'true');
        }
      } catch(err) {
        console.error('Error with install prompt:', err);
      }
      
      // Clear the deferred prompt variable, since it can only be used once
      deferredPrompt = null;
    } else {
      // If deferredPrompt isn't available but we're not on iOS, use alternative method
      showGenericInstallInstructions();
    }
  });
}

// Show iOS-specific installation instructions
function showIOSInstallInstructions() {
  const modal = document.createElement('div');
  modal.className = 'ios-install-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Install Simplos App</h3>
      <p>Follow these steps to add Simplos to your home screen:</p>
      <ol>
        <li>Tap the Share button <i class="fas fa-share-square"></i> at the bottom of your screen</li>
        <li>Scroll down and tap "Add to Home Screen" <i class="fas fa-plus-square"></i></li>
        <li>Tap "Add" in the top right corner</li>
      </ol>
      <p>Once installed, you'll be able to open Simplos from your home screen anytime!</p>
      <button class="close-button main-button">Got it!</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add styling
  const style = document.createElement('style');
  style.textContent = `
    .ios-install-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    .ios-install-modal .modal-content {
      background: var(--glass);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 2rem;
      max-width: 90%;
      width: 350px;
      text-align: center;
    }
    .ios-install-modal h3 {
      color: var(--gold);
      margin-bottom: 1.5rem;
    }
    .ios-install-modal ol {
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .ios-install-modal li {
      margin-bottom: 1rem;
    }
    .ios-install-modal .close-button {
      margin-top: 1rem;
    }
  `;
  document.head.appendChild(style);
  
  // Add close button functionality
  modal.querySelector('.close-button').addEventListener('click', () => {
    document.body.removeChild(modal);
    document.head.removeChild(style);
    // Mark as installed since the user has seen instructions
    localStorage.setItem('ios_instructions_shown', 'true');
  });
}

// Show generic installation instructions
function showGenericInstallInstructions() {
  const modal = document.createElement('div');
  modal.className = 'install-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Install Simplos App</h3>
      <p>To install this app on your device:</p>
      <ol>
        <li>Look for the install icon (<i class="fas fa-download"></i>) in your browser's menu</li>
        <li>Select "Install Simplos" or "Add to Home Screen"</li>
        <li>Confirm by tapping "Add" or "Install"</li>
      </ol>
      <p>Once installed, you'll be able to open Simplos from your home screen anytime!</p>
      <button class="close-button main-button">Got it!</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add styling (reusing same style as iOS)
  const style = document.createElement('style');
  style.textContent = `
    .install-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    .install-modal .modal-content {
      background: var(--glass);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 2rem;
      max-width: 90%;
      width: 350px;
      text-align: center;
    }
    .install-modal h3 {
      color: var(--gold);
      margin-bottom: 1.5rem;
    }
    .install-modal ol {
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .install-modal li {
      margin-bottom: 1rem;
    }
    .install-modal .close-button {
      margin-top: 1rem;
    }
  `;
  document.head.appendChild(style);
  
  // Add close button functionality
  modal.querySelector('.close-button').addEventListener('click', () => {
    document.body.removeChild(modal);
    document.head.removeChild(style);
  });
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

// Detect if the browser supports installation
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent default behavior
  e.preventDefault();
  
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  console.log('Install prompt detected and saved');
  
  // Initialize the download button
  initializeAppDownloadButton();
});

// When the app is successfully installed
window.addEventListener('appinstalled', (evt) => {
  console.log('App was installed');
  
  // Hide the install button
  const downloadAppButton = document.querySelector('.download-app-button');
  if (downloadAppButton) {
    downloadAppButton.style.display = 'none';
  }
  
  // Mark as installed in localStorage
  localStorage.setItem('app_installed', 'true');
});

// Initialize the download button
document.addEventListener('DOMContentLoaded', () => {
  // Check for standalone mode immediately
  if (checkIfAppIsInstalled()) {
    const downloadAppButton = document.querySelector('.download-app-button');
    if (downloadAppButton) {
      downloadAppButton.style.display = 'none';
    }
  } else {
    // If not in standalone mode, initialize the button
    initializeAppDownloadButton();
  }
});