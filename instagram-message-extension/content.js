// InstaLearning - Content Script with All Features

let settings = { direction: 'german-to-dutch', correctAction: 'next' };
let wordProgress = {};
let words = [];
let credits = 0;
let streak = 0;
let sessionStats = { startTime: null, correct: 0, wrong: 0, creditsEarned: 0, bestStreak: 0 };
let quizOverlay = null;
let isShowingQuiz = false;
let currentQuiz = null;
let hintTimer = null;
let speedRoundTimer = null;
let hasAnsweredCurrentQuiz = false;
let doubleOrNothingActive = false;
let currentGameMode = 'quiz'; // 'quiz', 'scramble', 'hangman', 'match'
let feedSwipeCount = 0;
const FEED_QUIZ_EVERY = 4;
let extensionContextAlive = true;

// Streak bonuses
const STREAK_BONUSES = { 3: 2, 5: 3, 7: 5, 10: 10 };
const CORRECT_ACTION_VALUES = new Set(['ask', 'next', 'instagram']);
function getStreakBonus(s) { return STREAK_BONUSES[s] || 0; }
function isLetter(char) { return /\p{L}/u.test(char); }
function normalizeCorrectAction(value) {
  return CORRECT_ACTION_VALUES.has(value) ? value : 'next';
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Audio pronunciation
function speak(text, lang) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'german' ? 'de-DE' : 'nl-NL';
    utterance.rate = 0.8;
    speechSynthesis.speak(utterance);
  }
}

// Confetti animation
function showConfetti() {
  const container = document.createElement('div');
  container.className = 'il-confetti-container';
  document.body.appendChild(container);
  
  const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da'];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'il-confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    confetti.style.animationDuration = (Math.random() * 1 + 1.5) + 's';
    container.appendChild(confetti);
  }
  
  setTimeout(() => container.remove(), 3000);
}

// Load data
async function loadData() {
  return new Promise((resolve) => {
    try {
      if (!isExtensionContextAlive()) {
        startSession();
        resolve();
        return;
      }

      chrome.storage.sync.get(['direction', 'correctAction', 'wordProgress', 'customWords', 'credits', 'streak'], (data) => {
        if (chrome.runtime?.lastError) {
          markExtensionContextInvalid(chrome.runtime.lastError);
          startSession();
          resolve();
          return;
        }

        if (data.direction) settings.direction = data.direction;
        settings.correctAction = normalizeCorrectAction(data.correctAction);
        if (data.wordProgress) wordProgress = data.wordProgress;
        if (typeof data.credits === 'number') credits = data.credits;
        if (typeof data.streak === 'number') streak = data.streak;
        words = data.customWords?.length > 0 ? data.customWords : DEFAULT_WORDS;
        startSession();
        resolve();
      });
    } catch (error) {
      markExtensionContextInvalid(error);
      startSession();
      resolve();
    }
  });
}

function saveProgress() {
  if (!isExtensionContextAlive()) return;
  try {
    chrome.storage.sync.set({ wordProgress, credits, streak }, () => {
      if (chrome.runtime?.lastError) {
        markExtensionContextInvalid(chrome.runtime.lastError);
      }
    });
  } catch (error) {
    markExtensionContextInvalid(error);
  }
}

function startSession() {
  sessionStats = { startTime: Date.now(), correct: 0, wrong: 0, creditsEarned: 0, bestStreak: 0 };
}

function saveSession() {
  if (!isExtensionContextAlive()) return;

  const duration = Math.floor((Date.now() - sessionStats.startTime) / 1000);
  if (sessionStats.correct === 0 && sessionStats.wrong === 0) return;
  
  const session = {
    date: new Date().toISOString(), duration,
    correct: sessionStats.correct, wrong: sessionStats.wrong,
    creditsEarned: sessionStats.creditsEarned, bestStreak: sessionStats.bestStreak,
    accuracy: sessionStats.correct + sessionStats.wrong > 0 
      ? Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.wrong)) * 100) : 0
  };
  
  try {
    chrome.storage.sync.get(['sessions'], (data) => {
      if (chrome.runtime?.lastError) {
        markExtensionContextInvalid(chrome.runtime.lastError);
        return;
      }

      const sessions = data.sessions || [];
      sessions.push(session);
      if (sessions.length > 50) sessions.shift();

      chrome.storage.sync.set({ sessions }, () => {
        if (chrome.runtime?.lastError) {
          markExtensionContextInvalid(chrome.runtime.lastError);
        }
      });
    });
  } catch (error) {
    markExtensionContextInvalid(error);
  }
}

window.addEventListener('pagehide', saveSession);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveSession();
});

function handleInvalidatedContextError(errorLike) {
  const message = (errorLike && (errorLike.message || String(errorLike))) || '';
  if (message.includes('Extension context invalidated')) {
    markExtensionContextInvalid(errorLike);
    return true;
  }
  return false;
}

window.addEventListener('error', (event) => {
  if (handleInvalidatedContextError(event.error || event.message)) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (handleInvalidatedContextError(event.reason)) {
    event.preventDefault();
  }
});

if (isExtensionContextAlive()) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.direction) settings.direction = changes.direction.newValue;
    if (changes.correctAction) settings.correctAction = normalizeCorrectAction(changes.correctAction.newValue);
    if (changes.wordProgress) wordProgress = changes.wordProgress.newValue || {};
    if (changes.credits) credits = changes.credits.newValue || 0;
    if (changes.streak) streak = changes.streak.newValue || 0;
    if (changes.customWords) words = changes.customWords.newValue?.length > 0 ? changes.customWords.newValue : DEFAULT_WORDS;
  });
}

function isExtensionContextAlive() {
  if (!extensionContextAlive) return false;
  try {
    return typeof chrome !== 'undefined' &&
           !!chrome.runtime?.id &&
           !!chrome.storage?.sync;
  } catch (error) {
    markExtensionContextInvalid(error);
    return false;
  }
}

function markExtensionContextInvalid(error) {
  extensionContextAlive = false;
  console.warn('[InstaLearning] Extension context is invalid. Reload the Instagram tab after extension reload.', error);
}

function getWordLevel(wordId) { return wordProgress[wordId]?.level || 1; }

function updateWordProgress(wordId, correct) {
  if (!wordProgress[wordId]) wordProgress[wordId] = { level: 1, correct: 0 };
  
  const oldLevel = wordProgress[wordId].level;
  
  if (correct) {
    wordProgress[wordId].correct++;
    if (wordProgress[wordId].correct >= 3 && wordProgress[wordId].level < 4) {
      wordProgress[wordId].level++;
      wordProgress[wordId].correct = 0;
      // Level up celebration!
      if (wordProgress[wordId].level > oldLevel) {
        showConfetti();
        showLevelUpPopup(wordProgress[wordId].level);
      }
    }
  } else {
    if (wordProgress[wordId].level > 1) wordProgress[wordId].level--;
    wordProgress[wordId].correct = 0;
  }
  saveProgress();
}

function showLevelUpPopup(newLevel) {
  const popup = quizOverlay?.querySelector('.il-bonus-popup');
  if (popup) {
    popup.textContent = `🎉 Level Up! Now Level ${newLevel}!`;
    popup.classList.add('visible');
    setTimeout(() => popup.classList.remove('visible'), 2500);
  }
}

function pickWord() {
  const weights = words.map((_, idx) => {
    const progress = wordProgress[idx];
    const level = progress?.level || 1;
    const correctCount = progress?.correct || 0;
    let weight = 5 - level;
    if (correctCount > 0 && correctCount < 3) weight += 10;
    return weight;
  });
  
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < words.length; i++) {
    random -= weights[i];
    if (random <= 0) return { word: words[i], index: i };
  }
  return { word: words[0], index: 0 };
}

function getDirection() {
  if (settings.direction === 'mixed') return Math.random() > 0.5 ? 'german-to-dutch' : 'dutch-to-german';
  return settings.direction;
}

function generateWrongAnswers(correctAnswer, isGerman) {
  const field = isGerman ? 'german' : 'dutch';
  return words.map(w => w[field]).filter(w => w.toLowerCase() !== correctAnswer.toLowerCase())
    .sort(() => Math.random() - 0.5).slice(0, 3);
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

function setQuestion(direction, text) {
  const questionEl = quizOverlay?.querySelector('.il-quiz-question');
  if (!questionEl) return;

  questionEl.textContent = '';
  const dirEl = document.createElement('span');
  dirEl.className = 'il-direction';
  dirEl.textContent = direction === 'german-to-dutch' ? '🇩🇪 → 🇳🇱' : '🇳🇱 → 🇩🇪';

  const wordEl = document.createElement('span');
  wordEl.className = 'il-word';
  wordEl.textContent = text;

  questionEl.appendChild(dirEl);
  questionEl.appendChild(wordEl);
}


// Create overlay
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
        <button class="il-close-btn hidden" type="button" title="Return to Instagram">✕</button>
      </div>
      <div class="il-progress-bar"><div class="il-progress-fill"></div></div>
      <div class="il-quiz-question"></div>
      <div class="il-word-info"></div>
      <div class="il-quiz-content"></div>
      <div class="il-quiz-feedback"></div>
      <div class="il-bonus-popup"></div>
      <div class="il-quiz-actions"></div>
    </div>
  `;
  document.body.appendChild(quizOverlay);
  const closeBtn = quizOverlay.querySelector('.il-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideQuiz);
  }
  return quizOverlay;
}

function updateCreditDisplay() {
  const creditEl = document.getElementById('il-credit-count');
  const streakEl = document.getElementById('il-streak-count');
  const closeBtn = quizOverlay?.querySelector('.il-close-btn');
  if (creditEl) creditEl.textContent = credits;
  if (streakEl) streakEl.textContent = streak;
  if (closeBtn) closeBtn.classList.toggle('hidden', credits <= 0);
}

function updateProgressBar(wordIndex) {
  const progress = wordProgress[wordIndex];
  const level = progress?.level || 1;
  const correct = progress?.correct || 0;
  const percentage = ((level - 1) * 33.33) + (correct / 3 * 33.33);
  
  const fill = quizOverlay?.querySelector('.il-progress-fill');
  if (fill) {
    fill.style.width = Math.min(percentage, 100) + '%';
    fill.className = `il-progress-fill il-progress-level-${level}`;
  }
}

function showWordInfo(word, direction) {
  const infoEl = quizOverlay?.querySelector('.il-word-info');
  if (!infoEl || !word) return;
  
  const emoji = word.emoji || '';
  const example = word.example || '';

  infoEl.textContent = '';

  if (emoji) {
    const emojiEl = document.createElement('span');
    emojiEl.className = 'il-emoji';
    emojiEl.textContent = emoji;
    infoEl.appendChild(emojiEl);
  }

  const deBtn = document.createElement('button');
  deBtn.className = 'il-audio-btn';
  deBtn.type = 'button';
  deBtn.dataset.word = word.german || '';
  deBtn.dataset.lang = 'german';
  deBtn.textContent = '🔊 DE';
  deBtn.addEventListener('click', () => speak(deBtn.dataset.word, deBtn.dataset.lang));
  infoEl.appendChild(deBtn);

  const nlBtn = document.createElement('button');
  nlBtn.className = 'il-audio-btn';
  nlBtn.type = 'button';
  nlBtn.dataset.word = word.dutch || '';
  nlBtn.dataset.lang = 'dutch';
  nlBtn.textContent = '🔊 NL';
  nlBtn.addEventListener('click', () => speak(nlBtn.dataset.word, nlBtn.dataset.lang));
  infoEl.appendChild(nlBtn);

  if (example) {
    const exampleEl = document.createElement('div');
    exampleEl.className = 'il-example';
    exampleEl.textContent = `"${example}"`;
    infoEl.appendChild(exampleEl);
  }
}

function showBonusPopup(bonus, streakCount) {
  const popup = quizOverlay?.querySelector('.il-bonus-popup');
  if (popup) {
    popup.textContent = `🎉 ${streakCount} streak! +${bonus} bonus!`;
    popup.classList.add('visible');
    setTimeout(() => popup.classList.remove('visible'), 2000);
  }
}

// Double or Nothing
function showDoubleOrNothing() {
  const actions = quizOverlay?.querySelector('.il-quiz-actions');
  if (!actions || credits < 1) return;
  
  const donBtn = document.createElement('button');
  donBtn.className = 'il-action-btn il-don-btn';
  donBtn.textContent = `🎰 Double or Nothing (${credits} credits at stake)`;
  donBtn.addEventListener('click', () => {
    doubleOrNothingActive = true;
    hideQuiz();
    setTimeout(showQuiz, 300);
  });
  actions.appendChild(donBtn);
}

function showActionButtons(wasCorrect) {
  const actions = quizOverlay?.querySelector('.il-quiz-actions');
  if (!actions) return;
  actions.innerHTML = '';
  
  // Mini-game buttons
  const gameRow = document.createElement('div');
  gameRow.className = 'il-game-row';
  gameRow.innerHTML = `
    <button class="il-mini-btn" data-game="scramble">🔀 Scramble</button>
    <button class="il-mini-btn" data-game="hangman">☠️ Hangman</button>
    <button class="il-mini-btn" data-game="match">🎯 Match</button>
  `;
  gameRow.querySelectorAll('.il-mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentGameMode = btn.dataset.game;
      hideQuiz();
      setTimeout(() => showMiniGame(btn.dataset.game), 300);
    });
  });
  actions.appendChild(gameRow);
  
  if (wasCorrect && credits > 0) {
    const keepBtn = document.createElement('button');
    keepBtn.className = 'il-action-btn il-learn-btn';
    keepBtn.textContent = '📚 Keep Learning';
    keepBtn.addEventListener('click', () => { hideQuiz(); setTimeout(showQuiz, 300); });
    
    const watchBtn = document.createElement('button');
    watchBtn.className = 'il-action-btn il-watch-btn';
    watchBtn.textContent = `📱 Watch Instagram (${credits} swipes)`;
    watchBtn.addEventListener('click', hideQuiz);
    
    actions.appendChild(keepBtn);
    actions.appendChild(watchBtn);
    
    // Double or nothing option
    if (credits >= 2) showDoubleOrNothing();
  } else if (wasCorrect) {
    const keepBtn = document.createElement('button');
    keepBtn.className = 'il-action-btn il-learn-btn';
    keepBtn.textContent = '📚 Keep Learning (+1 credit)';
    keepBtn.addEventListener('click', () => { hideQuiz(); setTimeout(showQuiz, 300); });
    actions.appendChild(keepBtn);
  } else {
    const tryBtn = document.createElement('button');
    tryBtn.className = 'il-action-btn il-learn-btn';
    tryBtn.textContent = '🔄 Try Another';
    tryBtn.addEventListener('click', () => { hideQuiz(); setTimeout(showQuiz, 300); });
    actions.appendChild(tryBtn);
  }
}


// ============ MINI GAMES ============

// Word Scramble
function showScrambleGame() {
  const { word, index } = pickWord();
  const direction = getDirection();
  const answer = direction === 'german-to-dutch' ? word.dutch : word.german;
  const question = direction === 'german-to-dutch' ? word.german : word.dutch;
  
  currentQuiz = { word, index, direction, answer };
  
  const scrambled = answer.split('').sort(() => Math.random() - 0.5).join('');
  const content = quizOverlay?.querySelector('.il-quiz-content');

  setQuestion(direction, question);
  
  showWordInfo(word, direction);

  content.textContent = '';
  const gameEl = document.createElement('div');
  gameEl.className = 'il-scramble-game';

  const scrambledEl = document.createElement('div');
  scrambledEl.className = 'il-scrambled';
  for (const letter of scrambled) {
    const letterEl = document.createElement('span');
    letterEl.className = 'il-letter';
    letterEl.textContent = letter;
    scrambledEl.appendChild(letterEl);
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'il-answer-input';
  input.placeholder = 'Unscramble the word...';
  input.autocomplete = 'off';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'il-submit-btn';
  submitBtn.type = 'button';
  submitBtn.textContent = 'Check';

  gameEl.appendChild(scrambledEl);
  gameEl.appendChild(input);
  gameEl.appendChild(submitBtn);
  content.appendChild(gameEl);
  
  input.focus();
  
  const check = () => {
    const correct = input.value.trim().toLowerCase() === answer.toLowerCase();
    handleAnswer(correct, answer);
  };
  
  submitBtn.addEventListener('click', check);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') check(); });
}

// Hangman
function showHangmanGame() {
  const { word, index } = pickWord();
  const direction = getDirection();
  const answer = direction === 'german-to-dutch' ? word.dutch : word.german;
  const question = direction === 'german-to-dutch' ? word.german : word.dutch;
  
  currentQuiz = { word, index, direction, answer };
  
  let guessed = new Set();
  let wrongGuesses = 0;
  const maxWrong = 6;
  const answerChars = Array.from(answer.toLowerCase());
  const keyboardLetters = Array.from(new Set([
    ...'abcdefghijklmnopqrstuvwxyz'.split(''),
    ...answerChars.filter((char) => isLetter(char))
  ]));
  
  const content = quizOverlay?.querySelector('.il-quiz-content');

  setQuestion(direction, question);
  
  showWordInfo(word, direction);
  
  function renderHangman() {
    const display = Array.from(answer).map((char) => {
      const lower = char.toLowerCase();
      if (!isLetter(lower)) return char;
      return guessed.has(lower) ? char : '_';
    }).join(' ');
    const hangmanStages = ['😀', '😐', '😟', '😰', '😱', '💀', '☠️'];
    
    content.innerHTML = `
      <div class="il-hangman-game">
        <div class="il-hangman-face">${hangmanStages[wrongGuesses]}</div>
        <div class="il-hangman-word">${escapeHtml(display)}</div>
        <div class="il-hangman-lives">Lives: ${'❤️'.repeat(maxWrong - wrongGuesses)}${'🖤'.repeat(wrongGuesses)}</div>
        <div class="il-keyboard">
          ${keyboardLetters.map(letter =>
            `<button class="il-key ${guessed.has(letter) ? 'used' : ''}" data-letter="${escapeHtml(letter)}" ${guessed.has(letter) ? 'disabled' : ''}>${escapeHtml(letter)}</button>`
          ).join('')}
        </div>
      </div>
    `;
    
    content.querySelectorAll('.il-key:not(.used)').forEach(btn => {
      btn.addEventListener('click', () => {
        const letter = (btn.dataset.letter || '').toLowerCase();
        guessed.add(letter);
        
        if (!answer.toLowerCase().includes(letter)) {
          wrongGuesses++;
        }
        
        const won = answerChars.every((char) => !isLetter(char) || guessed.has(char));
        const lost = wrongGuesses >= maxWrong;
        
        if (won || lost) {
          handleAnswer(won, answer);
        } else {
          renderHangman();
        }
      });
    });
  }
  
  renderHangman();
}

// Match Pairs (simplified - match 4 pairs)
function showMatchGame() {
  const targetPairs = Math.min(4, words.length);
  const pairs = [];
  const usedIndices = new Set();
  
  while (pairs.length < targetPairs && usedIndices.size < words.length) {
    const idx = Math.floor(Math.random() * words.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      pairs.push(words[idx]);
    }
  }
  
  currentQuiz = { pairs, matched: 0, attempts: 0, targetPairs };
  
  const cards = [];
  pairs.forEach(p => {
    cards.push({ text: p.german, pairId: p.german, type: 'german' });
    cards.push({ text: p.dutch, pairId: p.german, type: 'dutch' });
  });
  
  const shuffledCards = shuffle(cards);
  let selected = null;
  let matchedPairs = 0;
  
  const content = quizOverlay?.querySelector('.il-quiz-content');
  const questionEl = quizOverlay.querySelector('.il-quiz-question');
  questionEl.textContent = '';
  const wordEl = document.createElement('span');
  wordEl.className = 'il-word';
  wordEl.textContent = '🎯 Match the Pairs!';
  questionEl.appendChild(wordEl);
  quizOverlay.querySelector('.il-word-info').innerHTML = '';
  
  function renderCards() {
    content.innerHTML = `
      <div class="il-match-game">
        ${shuffledCards.map((card, i) => `
          <button class="il-match-card ${card.matched ? 'matched' : ''} ${card.selected ? 'selected' : ''}" 
                  data-index="${i}" ${card.matched ? 'disabled' : ''}>
            ${escapeHtml(card.text)}
          </button>
        `).join('')}
      </div>
    `;
    
    content.querySelectorAll('.il-match-card:not(.matched)').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const card = shuffledCards[idx];
        
        if (selected === null) {
          selected = idx;
          card.selected = true;
          renderCards();
        } else if (selected !== idx) {
          const prevCard = shuffledCards[selected];
          currentQuiz.attempts++;
          
          if (prevCard.pairId === card.pairId && prevCard.type !== card.type) {
            // Match!
            prevCard.matched = true;
            card.matched = true;
            matchedPairs++;
            
            if (matchedPairs === targetPairs) {
              // Won!
              setTimeout(() => handleAnswer(true, 'All matched!'), 500);
            }
          }
          
          prevCard.selected = false;
          selected = null;
          renderCards();
        }
      });
    });
  }
  
  renderCards();
}

function showMiniGame(game) {
  if (!quizOverlay) createOverlay();
  
  quizOverlay.querySelector('.il-quiz-feedback').innerHTML = '';
  quizOverlay.querySelector('.il-quiz-feedback').className = 'il-quiz-feedback';
  quizOverlay.querySelector('.il-quiz-actions').innerHTML = '';
  quizOverlay.querySelector('.il-level-badge').textContent = game.toUpperCase();
  
  updateCreditDisplay();
  quizOverlay.classList.add('visible');
  hasAnsweredCurrentQuiz = false;
  isShowingQuiz = true;
  
  switch(game) {
    case 'scramble': showScrambleGame(); break;
    case 'hangman': showHangmanGame(); break;
    case 'match': showMatchGame(); break;
  }
}


// ============ QUIZ LEVELS ============

function showLevel1(answer, wrongAnswers) {
  const options = shuffle([answer, ...wrongAnswers]);
  const content = quizOverlay?.querySelector('.il-quiz-content');
  content.innerHTML = '';
  
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'il-options';
  
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'il-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleAnswer(opt.toLowerCase() === answer.toLowerCase(), answer));
    optionsDiv.appendChild(btn);
  });
  
  content.appendChild(optionsDiv);
}

function showLevel2(answer) {
  const content = quizOverlay?.querySelector('.il-quiz-content');
  content.innerHTML = `
    <div class="il-type-quiz">
      <div class="il-hint-display">${'_'.repeat(answer.length)}</div>
      <input type="text" class="il-answer-input" placeholder="Type the translation..." autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  const hintDisplay = content.querySelector('.il-hint-display');
  input.focus();
  
  const revealedPositions = new Set();
  hintTimer = setInterval(() => {
    if (revealedPositions.size >= Math.floor(answer.length * 0.6)) {
      clearInterval(hintTimer);
      return;
    }
    let pos;
    do { pos = Math.floor(Math.random() * answer.length); } while (revealedPositions.has(pos));
    revealedPositions.add(pos);
    hintDisplay.textContent = answer.split('').map((l, i) => revealedPositions.has(i) ? l : '_').join('');
  }, 2000);
  
  const check = () => {
    clearInterval(hintTimer);
    handleAnswer(input.value.trim().toLowerCase() === answer.toLowerCase(), answer);
  };
  
  content.querySelector('.il-submit-btn').addEventListener('click', check);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') check(); });
}

function showLevel3(originalDirection) {
  const content = quizOverlay?.querySelector('.il-quiz-content');
  const reverseDir = originalDirection === 'german-to-dutch' ? 'dutch-to-german' : 'german-to-dutch';
  const { word } = currentQuiz;
  const newQuestion = reverseDir === 'german-to-dutch' ? word.german : word.dutch;
  const newAnswer = reverseDir === 'german-to-dutch' ? word.dutch : word.german;

  setQuestion(reverseDir, newQuestion);
  
  content.innerHTML = `
    <div class="il-type-quiz">
      <input type="text" class="il-answer-input" placeholder="Type (no hints!)..." autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  input.focus();
  
  const check = () => handleAnswer(input.value.trim().toLowerCase() === newAnswer.toLowerCase(), newAnswer);
  content.querySelector('.il-submit-btn').addEventListener('click', check);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') check(); });
}

function showLevel4(answer) {
  const content = quizOverlay?.querySelector('.il-quiz-content');
  let timeLeft = 5;
  
  content.innerHTML = `
    <div class="il-speed-quiz">
      <div class="il-timer">${timeLeft}s</div>
      <input type="text" class="il-answer-input" placeholder="Quick!" autocomplete="off">
      <button class="il-submit-btn">Check</button>
    </div>
  `;
  
  const input = content.querySelector('.il-answer-input');
  const timerEl = content.querySelector('.il-timer');
  input.focus();
  
  speedRoundTimer = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `${timeLeft}s`;
    if (timeLeft <= 2) timerEl.classList.add('il-timer-warning');
    if (timeLeft <= 0) { clearInterval(speedRoundTimer); handleAnswer(false, answer); }
  }, 1000);
  
  const check = () => {
    clearInterval(speedRoundTimer);
    handleAnswer(input.value.trim().toLowerCase() === answer.toLowerCase(), answer);
  };
  
  content.querySelector('.il-submit-btn').addEventListener('click', check);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') check(); });
}

// Handle answer
function handleAnswer(correct, correctAnswer) {
  if (!isShowingQuiz || hasAnsweredCurrentQuiz) return;
  hasAnsweredCurrentQuiz = true;
  clearTimers();

  const feedback = quizOverlay?.querySelector('.il-quiz-feedback');
  const content = quizOverlay?.querySelector('.il-quiz-content');
  
  content?.querySelectorAll('input, button').forEach(el => el.disabled = true);
  if (feedback) feedback.textContent = '';
  
  let earnedCredits = 0;
  
  if (correct) {
    streak++;
    earnedCredits = doubleOrNothingActive ? credits : 1;
    
    if (doubleOrNothingActive) {
      credits *= 2;
      const msg = document.createElement('span');
      msg.className = 'il-correct';
      msg.textContent = `🎰 DOUBLE! You now have ${credits} credits!`;
      feedback?.appendChild(msg);
      showConfetti();
    } else {
      credits += earnedCredits;
      const bonus = getStreakBonus(streak);
      if (bonus > 0) {
        credits += bonus;
        earnedCredits += bonus;
        setTimeout(() => showBonusPopup(bonus, streak), 500);
      }
      const msg = document.createElement('span');
      msg.className = 'il-correct';
      msg.textContent = `✓ Correct! +${earnedCredits} 💰`;
      feedback?.appendChild(msg);
    }
    
    sessionStats.correct++;
    sessionStats.creditsEarned += earnedCredits;
    if (streak > sessionStats.bestStreak) sessionStats.bestStreak = streak;
    feedback.className = 'il-quiz-feedback il-feedback-correct';
  } else {
    if (doubleOrNothingActive) {
      credits = 0;
      const msg = document.createElement('span');
      msg.className = 'il-wrong';
      msg.textContent = '💥 BUST! Lost all credits!';
      feedback?.appendChild(msg);
    } else {
      const msg = document.createElement('span');
      msg.className = 'il-wrong';
      msg.appendChild(document.createTextNode('✗ Answer: '));
      const answerEl = document.createElement('strong');
      answerEl.textContent = correctAnswer;
      msg.appendChild(answerEl);
      feedback?.appendChild(msg);
    }
    streak = 0;
    sessionStats.wrong++;
    feedback.className = 'il-quiz-feedback il-feedback-wrong';
  }
  
  doubleOrNothingActive = false;
  updateCreditDisplay();
  
  if (currentQuiz?.index !== undefined) {
    updateWordProgress(currentQuiz.index, correct);
    updateProgressBar(currentQuiz.index);
  }

  if (!correct) {
    setTimeout(() => showActionButtons(false), 800);
    return;
  }

  const action = normalizeCorrectAction(settings.correctAction);
  if (action === 'ask') {
    setTimeout(() => showActionButtons(true), 800);
    return;
  }

  if (action === 'next') {
    setTimeout(() => {
      if (!isShowingQuiz) return;
      hideQuiz();
      setTimeout(showQuiz, 300);
    }, 900);
    return;
  }

  // action === 'instagram'
  setTimeout(() => {
    if (!isShowingQuiz) return;
    hideQuiz();
  }, 900);
}


// Show quiz
function showQuiz() {
  if (isShowingQuiz || words.length === 0) return;
  
  clearTimers();
  currentGameMode = 'quiz';
  const overlay = createOverlay();
  const { word, index } = pickWord();
  const level = getWordLevel(index);
  const direction = getDirection();
  
  const question = direction === 'german-to-dutch' ? word.german : word.dutch;
  const answer = direction === 'german-to-dutch' ? word.dutch : word.german;
  
  currentQuiz = { word, index, direction, answer };
  
  updateCreditDisplay();
  updateProgressBar(index);
  
  overlay.querySelector('.il-level-badge').textContent = `Level ${level}`;
  overlay.querySelector('.il-level-badge').className = `il-level-badge il-level-${level}`;
  
  setQuestion(direction, question);
  
  showWordInfo(word, direction);
  
  overlay.querySelector('.il-quiz-feedback').innerHTML = '';
  overlay.querySelector('.il-quiz-feedback').className = 'il-quiz-feedback';
  overlay.querySelector('.il-quiz-actions').innerHTML = '';
  
  if (doubleOrNothingActive) {
    overlay.querySelector('.il-quiz-header').classList.add('il-don-mode');
  } else {
    overlay.querySelector('.il-quiz-header').classList.remove('il-don-mode');
  }
  
  switch (level) {
    case 1: showLevel1(answer, generateWrongAnswers(answer, direction === 'dutch-to-german')); break;
    case 2: showLevel2(answer); break;
    case 3: showLevel3(direction); break;
    case 4: showLevel4(answer); break;
  }
  
  overlay.classList.add('visible');
  hasAnsweredCurrentQuiz = false;
  isShowingQuiz = true;
}

function hideQuiz() {
  if (!quizOverlay) return;
  clearTimers();
  quizOverlay.classList.remove('visible');
  isShowingQuiz = false;
  hasAnsweredCurrentQuiz = false;
  currentQuiz = null;
}

function spendCredit() {
  if (credits > 0) {
    credits--;
    saveProgress();
    return true;
  }
  return false;
}

// Navigation detection
const LEARNING_PATH_RE = /^\/(stories|reels|reel)(\/|$)/;

function isLearningPath(pathname) {
  const path = pathname || '/';
  return path === '/' || LEARNING_PATH_RE.test(path);
}

function isStoriesPath(pathname) {
  return /^\/stories(\/|$)/.test(pathname || '');
}

function isReelsPath(pathname) {
  return /^\/(reels|reel)(\/|$)/.test(pathname || '');
}

function isMainFeed(pathname) {
  return pathname === '/' || pathname === '';
}

function isLearningContext() {
  const path = location.pathname;
  return isMainFeed(path) || isStoriesPath(path) || isReelsPath(path);
}

function detectStoryNavigation() {
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      const prevPath = new URL(lastUrl).pathname;
      const nextPath = new URL(location.href).pathname;
      lastUrl = location.href;
      if (isStoriesPath(prevPath) && isStoriesPath(nextPath)) handleSwipe();
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
      const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollDiff = Math.abs(currentScroll - lastScrollTop);
      // Detect scroll on main feed or reels
      if (scrollDiff > 300 && (isMainFeed(location.pathname) || isReelsPath(location.pathname))) {
        handleSwipe();
        lastScrollTop = currentScroll;
      }
    }, 150);
  }, { passive: true });
}

function detectWheelNavigation() {
  let wheelAccumulator = 0;
  let wheelDebounce = null;

  window.addEventListener('wheel', (e) => {
    if (!isMainFeed(location.pathname) && !isReelsPath(location.pathname)) return;
    wheelAccumulator += Math.abs(e.deltaY);

    if (wheelDebounce) clearTimeout(wheelDebounce);
    wheelDebounce = setTimeout(() => {
      if (wheelAccumulator > 260) {
        handleSwipe();
      }
      wheelAccumulator = 0;
    }, 120);
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
    const isStoryNav = e.target.closest('[role="button"]') || e.target.closest('button');
    if (isStoryNav && isStoriesPath(location.pathname)) {
      setTimeout(handleSwipe, 100);
    }
  }, true);
}

function detectTouchNavigation() {
  let touchStartX = null;
  let touchStartY = null;
  let touchStartTime = 0;
  let lastSwipeAt = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0]?.clientX ?? null;
    touchStartY = e.touches[0]?.clientY ?? null;
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (touchStartY === null || touchStartX === null) return;
    
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY;
    const deltaX = Math.abs(endX - touchStartX);
    const deltaY = Math.abs(endY - touchStartY);
    const touchDuration = Date.now() - touchStartTime;
    const now = Date.now();

    // Debounce
    if (now - lastSwipeAt < 350) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    // Vertical swipe for main feed and reels
    if (deltaY > 60 && deltaY > deltaX && (isMainFeed(location.pathname) || isReelsPath(location.pathname))) {
      lastSwipeAt = now;
      handleSwipe();
    }
    
    // Horizontal swipe for stories
    if (deltaX > 50 && deltaX > deltaY && isStoriesPath(location.pathname)) {
      lastSwipeAt = now;
      handleSwipe();
    }
    
    // Tap on left/right side of screen for stories
    const isTap = deltaX < 15 && deltaY < 15 && touchDuration < 300;
    if (isTap && isStoriesPath(location.pathname)) {
      const screenWidth = window.innerWidth;
      if (touchStartX < screenWidth * 0.3 || touchStartX > screenWidth * 0.7) {
        lastSwipeAt = now;
        setTimeout(handleSwipe, 150);
      }
    }

    touchStartX = null;
    touchStartY = null;
  }, { passive: true });
}

function detectContextEntryFallback() {
  let lastHref = location.href;

  const checkForContextEntry = () => {
    if (location.href === lastHref) return;

    const prevPath = new URL(lastHref).pathname;
    const nextPath = location.pathname;
    lastHref = location.href;

    // If user navigates into stories/reels/feed with no credits, force quiz visibility.
    if (!isLearningPath(prevPath) && isLearningPath(nextPath) && credits <= 0 && !isShowingQuiz) {
      setTimeout(() => {
        if (!isShowingQuiz && isLearningContext() && credits <= 0) {
          showQuiz();
        }
      }, 300);
    }
  };

  window.addEventListener('popstate', checkForContextEntry);
  window.addEventListener('hashchange', checkForContextEntry);

  const observer = new MutationObserver(checkForContextEntry);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(checkForContextEntry, 1000);
}

function handleSwipe() {
  console.log(`[InstaLearning] Swipe detected on ${location.pathname}, credits: ${credits}, isLearningContext: ${isLearningContext()}`);
  
  if (isShowingQuiz) {
    console.log('[InstaLearning] Quiz already showing, ignoring swipe');
    return;
  }
  
  if (!isLearningContext()) {
    console.log('[InstaLearning] Not in learning context, ignoring swipe');
    return;
  }

  if (credits <= 0) {
    console.log('[InstaLearning] No credits, showing quiz');
    showQuiz();
    return;
  }

  const spent = spendCredit();
  if (!spent) {
    console.log('[InstaLearning] Failed to spend credit, showing quiz');
    showQuiz();
    return;
  }
  console.log(`[InstaLearning] Spent credit, remaining: ${credits}`);

  // Feed mode: quiz cadence by swipe count, while still consuming credits.
  if (isMainFeed(location.pathname)) {
    feedSwipeCount++;
    console.log(`[InstaLearning] Feed swipe count: ${feedSwipeCount}/${FEED_QUIZ_EVERY}`);
    if (feedSwipeCount >= FEED_QUIZ_EVERY || credits <= 0) {
      feedSwipeCount = 0;
      console.log('[InstaLearning] Feed threshold/credits reached, showing quiz');
      showQuiz();
    }
    return;
  }

  // Stories/Reels: continue until credits run out.
  if (credits <= 0) showQuiz();
}

// Initialize
async function init() {
  console.log('[InstaLearning] Initializing...');
  await loadData();
  console.log(`[InstaLearning] Loaded - credits: ${credits}, words: ${words.length}, path: ${location.pathname}`);
  console.log(`[InstaLearning] isLearningContext: ${isLearningContext()}, isMainFeed: ${isMainFeed(location.pathname)}`);
  
  if (credits <= 0 && isLearningContext()) {
    console.log('[InstaLearning] No credits on learning page, showing quiz in 1s');
    setTimeout(showQuiz, 1000);
  }
  
  detectStoryNavigation();
  detectReelNavigation();
  detectWheelNavigation();
  detectKeyboardNavigation();
  detectClickNavigation();
  detectTouchNavigation();
  detectContextEntryFallback();
  
  console.log('[InstaLearning] All detectors initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
