// InstaLearning - Popup Script

let words = [];
let wordProgress = {};
let credits = 0;
let streak = 0;
const STATUS_ID_BY_PANEL = {
  settings: 'settingsStatus',
  words: 'wordStatus',
  stats: 'statsStatus'
};

function notifyActiveInstagramTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab?.id || !activeTab?.url || !activeTab.url.includes('instagram.com')) {
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, message, () => {
      // Ignore "Receiving end does not exist" when content script is not available.
      void chrome.runtime.lastError;
    });
  });
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    
    if (tab.dataset.tab === 'words') loadWordList();
    if (tab.dataset.tab === 'stats') loadStats();
  });
});

// Load settings on popup open
function loadSettings() {
  chrome.storage.sync.get(['direction', 'correctAction', 'customWords', 'wordProgress', 'credits', 'streak'], (data) => {
    if (data.direction) document.getElementById('direction').value = data.direction;
    document.getElementById('correctAction').value = data.correctAction || 'next';
    
    words = data.customWords && data.customWords.length > 0 ? data.customWords : DEFAULT_WORDS;
    wordProgress = data.wordProgress || {};
    credits = data.credits || 0;
    streak = data.streak || 0;
    
    document.getElementById('currentCredits').textContent = credits;
    document.getElementById('currentStreak').textContent = streak;
  });
}

loadSettings();

// Update display when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.credits) {
      credits = changes.credits.newValue || 0;
      document.getElementById('currentCredits').textContent = credits;
    }
    if (changes.streak) {
      streak = changes.streak.newValue || 0;
      document.getElementById('currentStreak').textContent = streak;
    }
  }
});

// Save settings
document.getElementById('saveSettings').addEventListener('click', () => {
  const direction = document.getElementById('direction').value;
  const correctAction = document.getElementById('correctAction').value;
  
  chrome.storage.sync.set({ direction, correctAction }, () => {
    notifyActiveInstagramTab({ type: 'SETTINGS_UPDATED', direction, correctAction });
    showStatus('settings', 'Settings saved!');
  });
});

// Open quiz on Instagram tab
document.getElementById('openQuiz').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab?.url?.includes('instagram.com')) {
      showStatus('settings', 'Open Instagram first!');
      return;
    }
    chrome.tabs.sendMessage(activeTab.id, { type: 'OPEN_QUIZ' }, () => {
      if (chrome.runtime.lastError) {
        showStatus('settings', 'Refresh Instagram page');
        return;
      }
      window.close();
    });
  });
});

// Load word list
function loadWordList() {
  chrome.storage.sync.get(['customWords', 'wordProgress'], (data) => {
    words = data.customWords && data.customWords.length > 0 ? data.customWords : DEFAULT_WORDS;
    wordProgress = data.wordProgress || {};
    
    const listEl = document.getElementById('wordList');
    listEl.textContent = '';

    words.forEach((word, idx) => {
      const level = wordProgress[idx]?.level || 1;
      const item = document.createElement('div');
      item.className = 'word-item';

      const pair = document.createElement('span');
      pair.textContent = `${word.german} ↔ ${word.dutch}`;

      const badge = document.createElement('span');
      badge.className = 'word-level';
      badge.textContent = `L${level}`;

      item.appendChild(pair);
      item.appendChild(badge);
      listEl.appendChild(item);
    });
  });
}

// CSV Import
document.getElementById('csvImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const lines = text.split('\n').filter(line => line.trim());
    
    const newWords = [];
    for (const line of lines) {
      if (line.toLowerCase().includes('german') && line.toLowerCase().includes('dutch')) continue;
      
      const parts = line.split(/[,;\t]/).map(p => p.trim().replace(/"/g, ''));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        newWords.push({ german: parts[0], dutch: parts[1] });
      }
    }
    
    if (newWords.length > 0) {
      chrome.storage.sync.set({ customWords: newWords, wordProgress: {} }, () => {
        words = newWords;
        wordProgress = {};
        loadWordList();
        showStatus('words', `Imported ${newWords.length} words!`);

        notifyActiveInstagramTab({ type: 'WORDS_UPDATED', words: newWords });
      });
    } else {
      showStatus('words', 'No valid words found in CSV');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Reset to default words
document.getElementById('resetWords').addEventListener('click', () => {
  if (confirm('Reset to default word list? This will clear your custom words.')) {
    chrome.storage.sync.set({ customWords: [], wordProgress: {} }, () => {
      words = DEFAULT_WORDS;
      wordProgress = {};
      loadWordList();
      showStatus('words', 'Reset to default words');

      notifyActiveInstagramTab({ type: 'WORDS_UPDATED', words: DEFAULT_WORDS });
    });
  }
});

// Load stats
function loadStats() {
  chrome.storage.sync.get(['customWords', 'wordProgress', 'credits', 'sessions'], (data) => {
    const words = data.customWords && data.customWords.length > 0 ? data.customWords : DEFAULT_WORDS;
    const progress = data.wordProgress || {};
    const sessions = data.sessions || [];
    
    let mastered = 0, inProgress = 0, newCount = 0;
    
    for (let i = 0; i < words.length; i++) {
      const level = progress[i]?.level || 1;
      if (level === 4) mastered++;
      else if (level > 1) inProgress++;
      else newCount++;
    }
    
    document.getElementById('totalWords').textContent = words.length;
    document.getElementById('masteredWords').textContent = mastered;
    document.getElementById('inProgress').textContent = inProgress;
    document.getElementById('newWords').textContent = newCount;
    
    // Show recent sessions
    const sessionList = document.getElementById('sessionList');
    sessionList.textContent = '';

    if (sessions.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.opacity = '0.7';
      emptyState.style.textAlign = 'center';
      emptyState.style.padding = '8px';
      emptyState.textContent = 'No sessions yet';
      sessionList.appendChild(emptyState);
    } else {
      const recentSessions = sessions.slice(-10).reverse();
      recentSessions.forEach((s) => {
        const date = new Date(s.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const item = document.createElement('div');
        item.className = 'session-item';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'session-date';
        dateSpan.textContent = `${dateStr} ${timeStr}`;

        const statsRow = document.createElement('div');
        statsRow.className = 'session-stats';

        const duration = document.createElement('span');
        duration.className = 'session-stat';
        duration.textContent = `⏱️ ${formatDuration(s.duration)}`;

        const score = document.createElement('span');
        score.className = 'session-stat';
        score.textContent = `✓${s.correct} ✗${s.wrong}`;

        const accuracy = document.createElement('span');
        accuracy.className = 'session-stat';
        accuracy.textContent = `${s.accuracy}%`;

        statsRow.appendChild(duration);
        statsRow.appendChild(score);
        statsRow.appendChild(accuracy);

        item.appendChild(dateSpan);
        item.appendChild(statsRow);
        sessionList.appendChild(item);
      });
    }
    
    // Calculate all-time stats
    const allTimeStatsEl = document.getElementById('allTimeStats');
    allTimeStatsEl.textContent = '';

    if (sessions.length > 0) {
      const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);
      const totalCorrect = sessions.reduce((sum, s) => sum + s.correct, 0);
      const totalWrong = sessions.reduce((sum, s) => sum + s.wrong, 0);
      const totalCredits = sessions.reduce((sum, s) => sum + s.creditsEarned, 0);
      const bestStreak = Math.max(...sessions.map(s => s.bestStreak || 0));
      const avgAccuracy = totalCorrect + totalWrong > 0 
        ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) 
        : 0;

      const title = document.createElement('strong');
      title.textContent = '📈 All-Time Stats';
      allTimeStatsEl.appendChild(title);

      const p1 = document.createElement('p');
      p1.textContent = `⏱️ Total time: ${formatDuration(totalTime)}`;
      allTimeStatsEl.appendChild(p1);

      const p2 = document.createElement('p');
      p2.textContent = `✓ Total correct: ${totalCorrect} | ✗ Wrong: ${totalWrong}`;
      allTimeStatsEl.appendChild(p2);

      const p3 = document.createElement('p');
      p3.textContent = `💰 Credits earned: ${totalCredits}`;
      allTimeStatsEl.appendChild(p3);

      const p4 = document.createElement('p');
      p4.textContent = `🔥 Best streak: ${bestStreak}`;
      allTimeStatsEl.appendChild(p4);

      const p5 = document.createElement('p');
      p5.textContent = `🎯 Avg accuracy: ${avgAccuracy}%`;
      allTimeStatsEl.appendChild(p5);
    }
  });
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// Reset progress
document.getElementById('resetProgress').addEventListener('click', () => {
  if (confirm('Reset all learning progress? This will clear words, credits, streak, and session history.')) {
    chrome.storage.sync.set({ wordProgress: {}, credits: 0, streak: 0, sessions: [] }, () => {
      wordProgress = {};
      credits = 0;
      streak = 0;
      document.getElementById('currentCredits').textContent = 0;
      document.getElementById('currentStreak').textContent = 0;
      loadStats();
      showStatus('stats', 'Progress reset');
    });
  }
});

// Show status message
function showStatus(panel, message) {
  const statusEl = getStatusElement(panel);
  
  if (statusEl) {
    statusEl.textContent = message;
    setTimeout(() => statusEl.textContent = '', 3000);
  }
}

function getStatusElement(panelId) {
  const statusId = STATUS_ID_BY_PANEL[panelId] || `${panelId}Status`;
  let statusEl = document.getElementById(statusId);
  if (statusEl) return statusEl;

  const panelEl = document.getElementById(panelId);
  if (!panelEl) return null;

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.id = statusId;
  panelEl.appendChild(statusEl);
  return statusEl;
}

// Initial load
loadStats();
