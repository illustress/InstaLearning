// InstaLearning - Popup Script

let words = [];
let wordProgress = {};
let credits = 0;
let streak = 0;

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
  chrome.storage.sync.get(['direction', 'customWords', 'wordProgress', 'credits', 'streak'], (data) => {
    if (data.direction) document.getElementById('direction').value = data.direction;
    
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
  
  chrome.storage.sync.set({ direction }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED', direction });
      }
    });
    showStatus('settings', 'Settings saved!');
  });
});

// Load word list
function loadWordList() {
  chrome.storage.sync.get(['customWords', 'wordProgress'], (data) => {
    words = data.customWords && data.customWords.length > 0 ? data.customWords : DEFAULT_WORDS;
    wordProgress = data.wordProgress || {};
    
    const listEl = document.getElementById('wordList');
    listEl.innerHTML = words.map((word, idx) => {
      const level = wordProgress[idx]?.level || 1;
      return `
        <div class="word-item">
          <span>${word.german} ↔ ${word.dutch}</span>
          <span class="word-level">L${level}</span>
        </div>
      `;
    }).join('');
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
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'WORDS_UPDATED', words: newWords });
          }
        });
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
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'WORDS_UPDATED', words: DEFAULT_WORDS });
        }
      });
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
    if (sessions.length === 0) {
      sessionList.innerHTML = '<div style="opacity: 0.7; text-align: center; padding: 8px;">No sessions yet</div>';
    } else {
      const recentSessions = sessions.slice(-10).reverse();
      sessionList.innerHTML = recentSessions.map(s => {
        const date = new Date(s.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="session-item">
            <span class="session-date">${dateStr} ${timeStr}</span>
            <div class="session-stats">
              <span class="session-stat">⏱️ ${formatDuration(s.duration)}</span>
              <span class="session-stat">✓${s.correct} ✗${s.wrong}</span>
              <span class="session-stat">${s.accuracy}%</span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Calculate all-time stats
    if (sessions.length > 0) {
      const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);
      const totalCorrect = sessions.reduce((sum, s) => sum + s.correct, 0);
      const totalWrong = sessions.reduce((sum, s) => sum + s.wrong, 0);
      const totalCredits = sessions.reduce((sum, s) => sum + s.creditsEarned, 0);
      const bestStreak = Math.max(...sessions.map(s => s.bestStreak || 0));
      const avgAccuracy = totalCorrect + totalWrong > 0 
        ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) 
        : 0;
      
      document.getElementById('allTimeStats').innerHTML = `
        <strong>📈 All-Time Stats</strong>
        <p>⏱️ Total time: ${formatDuration(totalTime)}</p>
        <p>✓ Total correct: ${totalCorrect} | ✗ Wrong: ${totalWrong}</p>
        <p>💰 Credits earned: ${totalCredits}</p>
        <p>🔥 Best streak: ${bestStreak}</p>
        <p>🎯 Avg accuracy: ${avgAccuracy}%</p>
      `;
    } else {
      document.getElementById('allTimeStats').innerHTML = '';
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
  let statusEl = document.getElementById('wordStatus');
  if (panel === 'settings') {
    statusEl = document.querySelector('#settings .status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'status';
      document.getElementById('settings').appendChild(statusEl);
    }
  }
  
  if (statusEl) {
    statusEl.textContent = message;
    setTimeout(() => statusEl.textContent = '', 3000);
  }
}

// Initial load
loadStats();
