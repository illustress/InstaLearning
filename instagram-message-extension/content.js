// InstaLearning - Content Script with Play-to-Earn Credits

let settings = {
  direction: 'german-to-dutch'
};

let wordProgress = {};
let words = [];
let credits = 0;
let streak = 0;

// Session tracking
let sessionStats = {
  startTime: null,
  correct: 0,
  wrong: 0,
  creditsEarned: 0,
  bestStreak: 0
};

let quizOverlay = null;
let isShowingQuiz = false;
let currentQuiz = null;
let hintTimer = null;
let speedRoundTimer = null;
let hasAnsweredCurrentQuiz = false;

// Load data from storage
async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['direction', 'wordProgress', 'customWords', 'credits', 'streak', 'allTimeSessions'], (data) => {
      if (data.direction) settings.direction = data.direction;
      if (data.wordProgress) wordProgress = data.wordProgress;
      if (typeof data.credits === 'number') credits = data.credits;
      if (typeof data.streak === 'number') streak = data.streak;
      
      words = data.customWords && data.customWords.length > 0 
        ? data.customWords 
        : DEFAULT_WORDS;
      
      // Start new session
      startSession();
      
      console.log(`[InstaLearning] Loaded with ${credits} credits, ${streak} streak`);
      resolve();
    });
  });
}

// Session management
function startSession() {
  sessionStats = {
    startTime: Date.now(),
    correct: 0,
    wrong: 0,
    creditsEarned: 0,
    bestStreak: 0
  };
  console.log('[InstaLearning] New session started');
}

function getSessionDuration() {
  if (!sessionStats.startTime) return 0;
  return Math.floor((Date.now() - sessionStats.startTime) / 1000); // seconds
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function saveSession() {
  const duration = getSessionDuration();
  if (sessionStats.correct === 0 && sessionStats.wrong === 0) return; // Don't save empty sessions
  
  const session = {
    date: new Date().toISOString(),
    duration,
    correct: sessionStats.correct,
    wrong: sessionStats.wrong,
    creditsEarned: sessionStats.creditsEarned,
    bestStreak: sessionStats.bestStreak,
    accuracy: sessionStats.correct + sessionStats.wrong > 0 
      ? Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.wrong)) * 100) 
      : 0
  };
  
  chrome.storage.sync.get(['sessions'], (data) => {
    const sessions = data.sessions || [];
    sessions.push(session);
    // Keep last 50 sessions
    if (sessions.length > 50) sessions.shift();
    chrome.storage.sync.set({ sessions });
  });
  
  console.log('[InstaLearning] Session saved:', session);
}

// Save session when leaving page
window.addEventListener('beforeunload', saveSession);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveSession();
  }
});

// Save progress
function saveProgress() {
  chrome.storage.sync.set({ wordProgress, credits, streak });
}

// Streak bonus thresholds
const STREAK_BONUSES = {
  3: 2,   // 3 in a row = +2 bonus
  5: 3,   // 5 in a row = +3 bonus
  7: 5,   // 7 in a row = +5 bonus
  10: 10  // 10 in a row = +10 bonus
};

function getStreakBonus(currentStreak) {
  return STREAK_BONUSES[currentStreak] || 0;
}

// Listen for updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.direction) settings.direction = changes.direction.newValue;
  if (changes.wordProgress) wordProgress = changes.wordProgress.newValue || {};
  if (changes.credits) credits = changes.credits.newValue || 0;
  if (changes.streak) streak = changes.streak.newValue || 0;
  if (changes.customWords) {
    words = changes.customWords.newValue?.length > 0 ? changes.customWords.newValue : DEFAULT_WORDS;
  }
});

// Get word level (1-4)
function getWordLevel(wordId) {
  return wordProgress[wordId]?.level || 1;
}

// Update word progress after answer
function updateWordProgress(wordId, correct) {
  if (!wordProgress[wordId]) {
    wordProgress[wordId] = { level: 1, correct: 0 };
  }
  
  if (correct) {
    wordProgress[wordId].correct++;
    if (wordProgress[wordId].correct >= 3 && wordProgress[wordId].level < 4) {
      wordProgress[wordId].level++;
      wordProgress[wordId].correct = 0;
      console.log(`[InstaLearning] 🎉 Word leveled up to ${wordProgress[wordId].level}!`);
    }
  } else {
    if (wordProgress[wordId].level > 1) {
      wordProgress[wordId].level--;
    }
    wordProgress[wordId].correct = 0;
  }
  
  saveProgress();
}

// Pick a word for quiz
function pickWord() {
  const weights = words.map((word, idx) => {
    const progress = wordProgress[idx];
    const level = progress?.level || 1;
    const correctCount = progress?.correct || 0;
    
    let weight = 5 - level;
    if (correctCount > 0 && correctCount < 3) {
      weight += 10;
    }
    return weight;
  });
  
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < words.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return { word: words[i], index: i };
    }
  }
  return { word: words[0], index: 0 };
}

function getDirection() {
  if (settings.direction === 'mixed') {
    return Math.random() > 0.5 ? 'german-to-dutch' : 'dutch-to-german';
  }
  return settings.direction;
}

function generateWrongAnswers(correctAnswer, isGerman) {
  const field = isGerman ? 'german' : 'dutch';
  const others = words
    .map(w => w[field])
    .filter(w => w.toLowerCase() !== correctAnswer.toLowerCase());
  return others.sort(() => Math.random() - 0.5).slice(0, 3);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clearTimers() {
  if (hintTimer) { clearInterval(hintTimer); hintTimer = null; }
  if (speedRoundTimer) { clearInterval(speedRoundTimer); speedRoundTimer = null; }
}

// Create quiz overlay with credit system
function createOverlay() {
  if (quizOverlay) return quizOverlay;

  quizOverlay = document.createElement('div');
  quizOverlay.className = 'il-quiz-overlay';
  quizOverlay.innerHTML = `
    <div class="il-quiz-container">
      <div class="il-quiz-header">
        <span class="il-credits">💰 <span id="il-credit-count">0</span></span>
        <span class="il-streak">🔥 <span id="il-streak-count">0</span></span>
        <span class="il-level-badge">Level 1</span>
      </div>
      <div class="il-quiz-question"></div>
      <div class="il-quiz-content"></div>
      <div class="il-quiz-feedback"></div>
      <div class="il-bonus-popup"></div>
      <div class="il-quiz-actions"></div>
    </div>
  `;
  document.body.appendChild(quizOverlay);
  return quizOverlay;
}

function updateCreditDisplay() {
  const creditEl = document.getElementById('il-credit-count');
  const streakEl = document.getElementById('il-streak-count');
  if (creditEl) creditEl.textContent = credits;
  if (streakEl) streakEl.textContent = streak;
}

function showBonusPopup(bonus, streakCount) {
  const popup = quizOverlay.querySelector('.il-bonus-popup');
  popup.innerHTML = `🎉 ${streakCount} streak! +${bonus} bonus credits!`;
  popup.classList.add('visible');
  setTimeout(() => popup.classList.remove('visible'), 2000);
}

// Show action buttons after answering
function showActionButtons(wasCorrect) {
  const actions = quizOverlay.querySelector('.il-quiz-actions');
  actions.innerHTML = '';
  
  if (wasCorrect && credits > 0) {
    // Can choose to continue learning or watch Instagram
    const keepLearningBtn = document.createElement('button');
    keepLearningBtn.className = 'il-action-btn il-learn-btn';
    keepLearningBtn.textContent = '📚 Keep Learning';
    keepLearningBtn.addEventListener('click', () => {
      hideQuiz();
      setTimeout(showQuiz, 300);
    });
    
    const watchBtn = document.createElement('button');
    watchBtn.className = 'il-action-btn il-watch-btn';
    watchBtn.textContent = `📱 Watch Instagram (${credits} swipes)`;
    watchBtn.addEventListener('click', hideQuiz);
    
    actions.appendChild(keepLearningBtn);
    actions.appendChild(watchBtn);
  } else if (wasCorrect) {
    // Got it right but no credits yet - encourage more learning
    const keepLearningBtn = document.createElement('button');
    keepLearningBtn.className = 'il-action-btn il-learn-btn';
    keepLearningBtn.textContent = '📚 Keep Learning (+1 credit each)';
    keepLearningBtn.addEventListener('click', () => {
      hideQuiz();
      setTimeout(showQuiz, 300);
    });
    actions.appendChild(keepLearningBtn);
  } else {
    // Wrong answer - must try again
    const tryAgainBtn = document.createElement('button');
    tryAgainBtn.className = 'il-action-btn il-learn-btn';
    tryAgainBtn.textContent = '🔄 Try Another';
    tryAgainBtn.addEventListener('click', () => {
      hideQuiz();
      setTimeout(showQuiz, 300);
    });
    actions.appendChild(tryAgainBtn);
  }
}


// Show Level 1: Multiple Choice
function showLevel1(answer, wrongAnswers) {
  const options = shuffle([answer, ...wrongAnswers]);
  const content = quizOverlay.querySelector('.il-quiz-content');
  content.innerHTML = '';
  
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'il-options';
  
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'il-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      const correct = opt.toLowerCase() === answer.toLowerCase();
      handleAnswer(correct, answer);
    });
    optionsDiv.appendChild(btn);
  });
  
  content.appendChild(optionsDiv);
}

// Show Level 2: Type with random letter hints
function showLevel2(answer) {
  const content = quizOverlay.querySelector('.il-quiz-content');
  content.innerHTML = `
    <div class="il-type-quiz">
      <div class="il-hint-display">${'_'.repeat(answer.length)}</div>
      <input type="text" class="il-answer-input" placeholder="Type the translation..." autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  const submitBtn = content.querySelector('.il-submit-btn');
  const hintDisplay = content.querySelector('.il-hint-display');
  
  input.focus();
  
  const revealedPositions = new Set();
  hintTimer = setInterval(() => {
    if (revealedPositions.size >= Math.floor(answer.length * 0.6)) {
      clearInterval(hintTimer);
      return;
    }
    
    let pos;
    do {
      pos = Math.floor(Math.random() * answer.length);
    } while (revealedPositions.has(pos));
    
    revealedPositions.add(pos);
    
    let hint = '';
    for (let i = 0; i < answer.length; i++) {
      hint += revealedPositions.has(i) ? answer[i] : '_';
    }
    hintDisplay.textContent = hint;
  }, 2000);
  
  const checkAnswer = () => {
    clearInterval(hintTimer);
    const correct = input.value.trim().toLowerCase() === answer.toLowerCase();
    handleAnswer(correct, answer);
  };
  
  submitBtn.addEventListener('click', checkAnswer);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
}

// Show Level 3: Reverse direction, no hints
function showLevel3(originalDirection) {
  const content = quizOverlay.querySelector('.il-quiz-content');
  const reverseDir = originalDirection === 'german-to-dutch' ? 'dutch-to-german' : 'german-to-dutch';
  
  const { word } = currentQuiz;
  const newQuestion = reverseDir === 'german-to-dutch' ? word.german : word.dutch;
  const newAnswer = reverseDir === 'german-to-dutch' ? word.dutch : word.german;
  
  // Update question display
  const questionEl = quizOverlay.querySelector('.il-quiz-question');
  questionEl.innerHTML = `
    <span class="il-direction">${reverseDir === 'german-to-dutch' ? '🇩🇪 → 🇳🇱' : '🇳🇱 → 🇩🇪'}</span>
    <span class="il-word">${newQuestion}</span>
  `;
  
  content.innerHTML = `
    <div class="il-type-quiz">
      <input type="text" class="il-answer-input" placeholder="Type the translation (no hints!)..." autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  const submitBtn = content.querySelector('.il-submit-btn');
  input.focus();
  
  const checkAnswer = () => {
    const correct = input.value.trim().toLowerCase() === newAnswer.toLowerCase();
    handleAnswer(correct, newAnswer);
  };
  
  submitBtn.addEventListener('click', checkAnswer);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
}

// Show Level 4: Speed round
function showLevel4(answer) {
  const content = quizOverlay.querySelector('.il-quiz-content');
  let timeLeft = 5;
  
  content.innerHTML = `
    <div class="il-speed-quiz">
      <div class="il-timer">${timeLeft}s</div>
      <input type="text" class="il-answer-input" placeholder="Quick! Type the answer..." autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  const submitBtn = content.querySelector('.il-submit-btn');
  const timerEl = content.querySelector('.il-timer');
  input.focus();
  
  speedRoundTimer = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `${timeLeft}s`;
    if (timeLeft <= 2) timerEl.classList.add('il-timer-warning');
    if (timeLeft <= 0) {
      clearInterval(speedRoundTimer);
      handleAnswer(false, answer);
    }
  }, 1000);
  
  const checkAnswer = () => {
    clearInterval(speedRoundTimer);
    const correct = input.value.trim().toLowerCase() === answer.toLowerCase();
    handleAnswer(correct, answer);
  };
  
  submitBtn.addEventListener('click', checkAnswer);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
}

// Handle answer result
function handleAnswer(correct, correctAnswer) {
  if (!isShowingQuiz || !currentQuiz || hasAnsweredCurrentQuiz) return;
  hasAnsweredCurrentQuiz = true;
  clearTimers();

  const feedback = quizOverlay.querySelector('.il-quiz-feedback');
  const content = quizOverlay.querySelector('.il-quiz-content');
  
  content.querySelectorAll('input, button').forEach(el => el.disabled = true);
  
  if (correct) {
    streak++;
    credits++; // Base credit
    
    // Update session stats
    sessionStats.correct++;
    sessionStats.creditsEarned++;
    if (streak > sessionStats.bestStreak) {
      sessionStats.bestStreak = streak;
    }
    
    // Check for streak bonus
    const bonus = getStreakBonus(streak);
    if (bonus > 0) {
      credits += bonus;
      sessionStats.creditsEarned += bonus;
      feedback.innerHTML = `<span class="il-correct">✓ Correct! +1 credit 💰</span>`;
      setTimeout(() => showBonusPopup(bonus, streak), 500);
    } else {
      feedback.innerHTML = `<span class="il-correct">✓ Correct! +1 credit 💰</span>`;
    }
    feedback.className = 'il-quiz-feedback il-feedback-correct';
  } else {
    streak = 0; // Reset streak on wrong answer
    sessionStats.wrong++;
    feedback.innerHTML = `<span class="il-wrong">✗ The answer was: <strong>${correctAnswer}</strong></span>`;
    feedback.className = 'il-quiz-feedback il-feedback-wrong';
  }
  
  updateCreditDisplay();
  updateWordProgress(currentQuiz.index, correct);
  
  // Show action buttons after a short delay
  setTimeout(() => showActionButtons(correct), 800);
}

// Show quiz
function showQuiz() {
  if (isShowingQuiz || words.length === 0) return;
  
  clearTimers();
  const overlay = createOverlay();
  const { word, index } = pickWord();
  const level = getWordLevel(index);
  const direction = getDirection();
  
  const question = direction === 'german-to-dutch' ? word.german : word.dutch;
  const answer = direction === 'german-to-dutch' ? word.dutch : word.german;
  
  currentQuiz = { word, index, direction, answer };
  
  // Update header
  updateCreditDisplay();
  overlay.querySelector('.il-level-badge').textContent = `Level ${level}`;
  overlay.querySelector('.il-level-badge').className = `il-level-badge il-level-${level}`;
  
  // Set question
  overlay.querySelector('.il-quiz-question').innerHTML = `
    <span class="il-direction">${direction === 'german-to-dutch' ? '🇩🇪 → 🇳🇱' : '🇳🇱 → 🇩🇪'}</span>
    <span class="il-word">${question}</span>
  `;
  
  // Clear previous state
  overlay.querySelector('.il-quiz-feedback').innerHTML = '';
  overlay.querySelector('.il-quiz-feedback').className = 'il-quiz-feedback';
  overlay.querySelector('.il-quiz-actions').innerHTML = '';
  
  // Show appropriate level
  switch (level) {
    case 1:
      showLevel1(answer, generateWrongAnswers(answer, direction === 'dutch-to-german'));
      break;
    case 2:
      showLevel2(answer);
      break;
    case 3:
      showLevel3(direction);
      break;
    case 4:
      showLevel4(answer);
      break;
  }
  
  overlay.classList.add('visible');
  hasAnsweredCurrentQuiz = false;
  isShowingQuiz = true;
}

// Hide quiz
function hideQuiz() {
  if (!quizOverlay) return;
  clearTimers();
  quizOverlay.classList.remove('visible');
  isShowingQuiz = false;
  hasAnsweredCurrentQuiz = false;
  currentQuiz = null;
}

// Spend credit on swipe
function spendCredit() {
  if (credits > 0) {
    credits--;
    saveProgress();
    console.log(`[InstaLearning] Spent 1 credit. Remaining: ${credits}`);
    return true;
  }
  return false;
}

// Navigation detection
function isLearningContext() {
  return location.pathname.includes('/stories/') ||
         location.pathname.includes('/reels/') ||
         location.pathname.includes('/reel/');
}

function detectStoryNavigation() {
  let lastUrl = location.href;
  
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      const prevUrl = lastUrl;
      lastUrl = location.href;
      if (prevUrl.includes('/stories/') && lastUrl.includes('/stories/')) {
        handleSwipe();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function detectReelNavigation() {
  let lastScrollTop = 0;
  let scrollTimeout = null;

  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollDiff = Math.abs(window.scrollY - lastScrollTop);
      if (scrollDiff > 300) {
        handleSwipe();
        lastScrollTop = window.scrollY;
      }
    }, 150);
  }, { passive: true });
}

function detectKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (isLearningContext() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      handleSwipe();
    }
  });
}

function detectClickNavigation() {
  document.addEventListener('click', (e) => {
    const isStoryNav = e.target.closest('[role="button"]') || 
                       e.target.closest('button') ||
                       e.target.closest('[data-story]');
    
    if (isStoryNav && location.pathname.includes('/stories/')) {
      setTimeout(handleSwipe, 100);
    }
  }, true);
}

// Central swipe handler with credit system
function handleSwipe() {
  if (isShowingQuiz || !isLearningContext()) return;
  
  console.log(`[InstaLearning] Swipe detected. Credits: ${credits}`);
  
  if (credits <= 0) {
    // No credits - must answer quiz
    showQuiz();
  } else {
    // Spend a credit
    spendCredit();
  }
}

// Initialize
async function init() {
  console.log('[InstaLearning] Initialized with Play-to-Earn mode');
  await loadData();
  
  // Show initial quiz if no credits
  if (credits <= 0 && isLearningContext()) {
    setTimeout(showQuiz, 1000);
  }
  
  detectStoryNavigation();
  detectReelNavigation();
  detectKeyboardNavigation();
  detectClickNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
