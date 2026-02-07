// InstaLearning - Content Script

let settings = {
  message: 'Take a break! 🌟',
  frequency: 3
};

let swipeCount = 0;
let messageOverlay = null;
let isShowingMessage = false;

// Load settings from storage
chrome.storage.sync.get(['message', 'frequency'], (data) => {
  if (data.message) settings.message = data.message;
  if (data.frequency) settings.frequency = data.frequency;
});

// Listen for settings updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_UPDATED') {
    settings.message = msg.message || settings.message;
    settings.frequency = msg.frequency || settings.frequency;
  }
});

// Create the message overlay
function createOverlay() {
  if (messageOverlay) return messageOverlay;

  messageOverlay = document.createElement('div');
  messageOverlay.className = 'ig-message-overlay';
  messageOverlay.innerHTML = `
    <div class="ig-message-content">
      <div class="ig-message-text"></div>
      <div class="ig-message-hint">Tap or swipe to continue</div>
    </div>
  `;
  document.body.appendChild(messageOverlay);

  // Dismiss on click
  messageOverlay.addEventListener('click', hideMessage);

  return messageOverlay;
}

// Show the custom message
function showMessage() {
  if (isShowingMessage) return;
  
  const overlay = createOverlay();
  const textEl = overlay.querySelector('.ig-message-text');
  textEl.textContent = settings.message;
  
  overlay.classList.add('visible');
  isShowingMessage = true;

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (isShowingMessage) hideMessage();
  }, 5000);
}

// Hide the message
function hideMessage() {
  if (!messageOverlay) return;
  messageOverlay.classList.remove('visible');
  isShowingMessage = false;
}

// Detect navigation/swipes in Stories
function detectStoryNavigation() {
  // Watch for URL changes (story navigation)
  let lastUrl = location.href;
  
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handleSwipe();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Detect swipes in Reels
function detectReelNavigation() {
  let lastScrollTop = 0;
  let scrollTimeout = null;

  // For reels, detect scroll-based navigation
  const reelsContainer = document.querySelector('main');
  if (!reelsContainer) return;

  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentScroll = window.scrollY;
      const scrollDiff = Math.abs(currentScroll - lastScrollTop);
      
      // Significant scroll = likely a reel change
      if (scrollDiff > 300) {
        handleSwipe();
        lastScrollTop = currentScroll;
      }
    }, 150);
  }, { passive: true });
}

// Handle keyboard navigation
function detectKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Arrow keys for stories, Up/Down for reels
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      handleSwipe();
    }
  });
}

// Handle touch/click navigation on stories
function detectClickNavigation() {
  document.addEventListener('click', (e) => {
    // Check if clicking on story navigation areas
    const target = e.target;
    const isStoryNav = target.closest('[role="button"]') || 
                       target.closest('button') ||
                       target.closest('[data-story]');
    
    if (isStoryNav && location.pathname.includes('/stories/')) {
      setTimeout(handleSwipe, 100);
    }
  }, true);
}

// Central swipe handler
function handleSwipe() {
  if (isShowingMessage) return;
  
  swipeCount++;
  console.log(`[InstaLearning] Swipe count: ${swipeCount}/${settings.frequency}`);
  
  if (swipeCount >= settings.frequency) {
    swipeCount = 0;
    showMessage();
  }
}

// Initialize
function init() {
  console.log('[InstaLearning] Initialized');
  
  detectStoryNavigation();
  detectReelNavigation();
  detectKeyboardNavigation();
  detectClickNavigation();
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
