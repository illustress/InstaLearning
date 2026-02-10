// InstaLearning - Popup Script

let words = [];
let wordProgress = {};
let credits = 0;
let streak = 0;
const STATUS_ID_BY_PANEL = {
  settings: 'settingsStatus',
  words: 'wordStatus',
  stats: 'statsStatus',
  ai: 'aiTestStatus'
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
    chrome.storage.local.get(['aiCardCache'], (localData) => {
      const aiCache = localData.aiCardCache || {};
      
      const listEl = document.getElementById('wordList');
      listEl.textContent = '';

      words.forEach((word, idx) => {
        const level = wordProgress[idx]?.level || 1;
        const cacheKey = `${word.german}_${word.dutch}`.toLowerCase().replace(/\s+/g, '_');
        const hasAI = !!aiCache[cacheKey];
        
        const item = document.createElement('div');
        item.className = 'word-item';
        item.dataset.index = idx;

        const pair = document.createElement('span');
        
        // Create text node for the word pair
        const pairText = document.createTextNode(`${word.german} ↔ ${word.dutch} `);
        pair.appendChild(pairText);
        
        // Add AI indicator if card exists
        if (hasAI) {
          const aiIndicator = document.createElement('span');
          aiIndicator.className = 'word-has-ai';
          aiIndicator.textContent = '🤖';
          aiIndicator.title = 'AI card available';
          pair.appendChild(aiIndicator);
        }

        const badge = document.createElement('span');
        badge.className = 'word-level';
        badge.textContent = `L${level}`;

        item.appendChild(pair);
        item.appendChild(badge);
        
        item.addEventListener('click', () => showWordPreview(idx));
        
        listEl.appendChild(item);
      });
    });
  });
}

// Show word preview with AI card
function showWordPreview(index) {
  chrome.storage.sync.get(['customWords'], (data) => {
    const wordList = data.customWords?.length > 0 ? data.customWords : DEFAULT_WORDS;
    const word = wordList[index];
    if (!word) return;

    chrome.storage.local.get(['aiCardCache'], (localData) => {
      const aiCache = localData.aiCardCache || {};
      const cacheKey = `${word.german}_${word.dutch}`.toLowerCase().replace(/\s+/g, '_');
      const aiCard = aiCache[cacheKey];
      
      const previewEl = document.getElementById('wordPreview');
      const titleEl = document.getElementById('previewTitle');
      const contentEl = document.getElementById('previewContent');
      
      titleEl.textContent = `${word.german} ↔ ${word.dutch}`;
      
      let html = '';
      
      // Emoji
      if (word.emoji) {
        html += `<span class="preview-emoji">${escapeHtml(word.emoji)}</span>`;
      }
      
      // Original example
      if (word.example) {
        html += `<div class="preview-example">"${escapeHtml(word.example)}"</div>`;
      }
      
      // AI Card content
      if (aiCard) {
        html += '<div class="ai-card">';

        if (aiCard.imageUrl) {
          html += `<img class="ai-preview-image" src="${escapeHtml(aiCard.imageUrl)}" alt="${escapeHtml(word.german)}">`;
        } else if (aiCard.imagePrompt) {
          html += `<div class="ai-preview-image-placeholder" title="${escapeHtml(aiCard.imagePrompt)}">🎨 ${escapeHtml(word.emoji || '📝')}</div>`;
        }
        
        if (aiCard.mnemonic) {
          html += `<div class="ai-mnemonic">
            <span class="ai-mnemonic-label">💡 Memory Trick</span>
            <p>${escapeHtml(aiCard.mnemonic)}</p>
          </div>`;
        }
        
        if (aiCard.smartSentences) {
          html += '<div class="ai-sentences">';
          html += '<span class="ai-sentences-label">📝 AI Examples</span>';
          
          if (aiCard.smartSentences.sentence1) {
            html += `<p class="ai-sentence">${escapeHtml(aiCard.smartSentences.sentence1)}</p>`;
            html += `<p class="ai-translation">${escapeHtml(aiCard.smartSentences.sentence1_translation || '')}</p>`;
          }
          if (aiCard.smartSentences.sentence2) {
            html += `<p class="ai-sentence">${escapeHtml(aiCard.smartSentences.sentence2)}</p>`;
            html += `<p class="ai-translation">${escapeHtml(aiCard.smartSentences.sentence2_translation || '')}</p>`;
          }
          
          html += '</div>';
        }
        
        if (aiCard.imagePrompt) {
          html += `<div class="ai-image-prompt">${escapeHtml(aiCard.imagePrompt)}</div>`;
        }
        
        html += '</div>';
      } else {
        html += '<div class="preview-no-ai">No AI card generated yet.<br>Go to AI tab → Generate All Cards</div>';
      }
      
      contentEl.innerHTML = html;
      previewEl.style.display = 'block';
    });
  });
}

// HTML escape helper
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Close preview
document.getElementById('closePreview').addEventListener('click', () => {
  document.getElementById('wordPreview').style.display = 'none';
});

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
loadAISettings();

// ============ AI SETTINGS ============

function loadAISettings() {
  chrome.storage.sync.get(['aiSettings'], (data) => {
    const settings = data.aiSettings || {};
    
    document.getElementById('aiEnabled').value = settings.enabled ? 'true' : 'false';
    document.getElementById('aiProvider').value = settings.provider || 'openai';
    document.getElementById('aiApiKey').value = settings.apiKey || '';
    document.getElementById('aiMnemonics').checked = settings.generateMnemonics !== false;
    document.getElementById('aiSentences').checked = settings.generateSentences !== false;
    document.getElementById('aiImages').checked = settings.generateImages !== false;
    
    updateAIStatus(settings.enabled, !!settings.apiKey);
  });
}

function updateAIStatus(enabled, hasKey) {
  const statusEl = document.getElementById('aiStatus');
  const textEl = statusEl.querySelector('.ai-status-text');
  
  if (enabled) {
    statusEl.classList.add('active');
    textEl.textContent = hasKey ? 'AI Cards Enabled ✓' : 'AI Enabled (add API key)';
  } else {
    statusEl.classList.remove('active');
    textEl.textContent = 'AI Cards Disabled';
  }
}

function getAISettingsFromForm() {
  const settings = {
    enabled: document.getElementById('aiEnabled').value === 'true',
    provider: document.getElementById('aiProvider').value,
    apiKey: document.getElementById('aiApiKey').value.trim(),
    generateMnemonics: document.getElementById('aiMnemonics').checked,
    generateSentences: document.getElementById('aiSentences').checked,
    generateImages: document.getElementById('aiImages').checked,
    cacheCards: true
  };
  settings.model = settings.provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307';
  return settings;
}

function persistAISettings(settings, showFeedback = false) {
  chrome.storage.sync.set({ aiSettings: settings }, () => {
    updateAIStatus(settings.enabled, !!settings.apiKey);
    if (showFeedback) {
      showStatus('ai', 'AI settings saved!');
    }
  });
}

function loadAICache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiCardCache'], (data) => {
      resolve(data.aiCardCache || {});
    });
  });
}

function saveAICache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ aiCardCache: cache }, () => {
      resolve();
    });
  });
}

document.getElementById('saveAiSettings').addEventListener('click', () => {
  const settings = getAISettingsFromForm();
  persistAISettings(settings, true);
});

document.getElementById('testAi').addEventListener('click', async () => {
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const provider = document.getElementById('aiProvider').value;
  
  if (!apiKey) {
    showStatus('ai', 'Enter an API key first');
    return;
  }
  
  showStatus('ai', 'Testing connection...');
  
  try {
    let response;
    
    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }],
          max_tokens: 10
        })
      });
    } else {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }]
        })
      });
    }
    
    if (response.ok) {
      showStatus('ai', '✓ Connection successful!');
    } else {
      const error = await response.json().catch(() => ({}));
      showStatus('ai', `✗ Error: ${error.error?.message || response.status}`);
    }
  } catch (err) {
    showStatus('ai', `✗ Connection failed: ${err.message}`);
  }
});

document.getElementById('clearAiCache').addEventListener('click', () => {
  if (confirm('Clear all cached AI cards? They will be regenerated on next use.')) {
    chrome.storage.local.set({ aiCardCache: {} }, () => {
      showStatus('ai', 'AI cache cleared');
    });
  }
});

// Generate all AI cards
document.getElementById('generateAllCards').addEventListener('click', async () => {
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const provider = document.getElementById('aiProvider').value;
  
  if (!apiKey) {
    showStatus('ai', 'Enter an API key first');
    return;
  }
  
  // Get current words and cache
  chrome.storage.sync.get(['customWords', 'aiSettings'], async (data) => {
    const wordList = data.customWords?.length > 0 ? data.customWords : DEFAULT_WORDS;
    const cache = await loadAICache();
    const settings = data.aiSettings || {};
    
    // Filter words that need generation
    const wordsToGenerate = wordList.filter(word => {
      const key = `${word.german}_${word.dutch}`.toLowerCase().replace(/\s+/g, '_');
      return !cache[key];
    });
    
    if (wordsToGenerate.length === 0) {
      showStatus('ai', 'All cards already generated!');
      return;
    }
    
    // Show progress
    const progressEl = document.getElementById('aiProgress');
    const progressFill = document.getElementById('aiProgressFill');
    const progressText = document.getElementById('aiProgressText');
    progressEl.style.display = 'block';
    
    const generateBtn = document.getElementById('generateAllCards');
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generating...';
    
    let generated = 0;
    let errors = 0;
    
    for (const word of wordsToGenerate) {
      try {
        const card = await generateCardForWord(word, apiKey, provider, settings);
        
        if (card) {
          const key = `${word.german}_${word.dutch}`.toLowerCase().replace(/\s+/g, '_');
          cache[key] = { ...card, cachedAt: Date.now() };
          generated++;
        }
      } catch (err) {
        console.warn('Failed to generate card for', word.german, err);
        errors++;
      }
      
      // Update progress
      const total = wordsToGenerate.length;
      const done = generated + errors;
      progressFill.style.width = `${(done / total) * 100}%`;
      progressText.textContent = `${done} / ${total} (${generated} ✓, ${errors} ✗)`;
      
      // Save cache periodically
      if (done % 5 === 0) {
        await saveAICache(cache);
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 600));
    }
    
    // Final save
    await saveAICache(cache);
    
    generateBtn.disabled = false;
    generateBtn.textContent = '🚀 Generate All Cards';
    
    setTimeout(() => {
      progressEl.style.display = 'none';
    }, 3000);
    
    showStatus('ai', `Done! ${generated} cards generated, ${errors} errors`);
  });
});

// Generate a single card (used by batch generation)
async function generateCardForWord(word, apiKey, provider, settings) {
  const model = provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307';
  
  const prompt = `Generate learning content for this German-Dutch word pair:
German: ${word.german}
Dutch: ${word.dutch}

Return JSON with:
- mnemonic: A memorable trick (1-2 sentences) connecting the German and Dutch words using sound/visual associations
- sentence1: A simple German sentence using the word
- sentence1_translation: Dutch translation of sentence1
- sentence2: Another German sentence (different context)
- sentence2_translation: Dutch translation of sentence2
- imagePrompt: A short description (under 30 words) of a simple illustration representing this word

Keep sentences A1-A2 level. Make the mnemonic fun and memorable.
Return ONLY valid JSON, no other text.`;

  let response;
  
  if (provider === 'openai') {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7
      })
    });
  } else {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  }
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  const content = provider === 'openai' 
    ? data.choices[0]?.message?.content 
    : data.content[0]?.text;
  
  if (!content) return null;
  
  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  const parsed = JSON.parse(jsonMatch[0]);
  let imageUrl = null;

  if (provider === 'openai' && settings.generateImages !== false && parsed.imagePrompt) {
    imageUrl = await generateImageForPrompt(apiKey, parsed.imagePrompt);
  }
  
  return {
    german: word.german,
    dutch: word.dutch,
    emoji: word.emoji || '',
    mnemonic: parsed.mnemonic,
    smartSentences: {
      sentence1: parsed.sentence1,
      sentence1_translation: parsed.sentence1_translation,
      sentence2: parsed.sentence2,
      sentence2_translation: parsed.sentence2_translation
    },
    imagePrompt: parsed.imagePrompt,
    imageUrl,
    generatedAt: Date.now()
  };
}

async function generateImageForPrompt(apiKey, imagePrompt) {
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Simple, cute cartoon flashcard illustration: ${imagePrompt}. Style: minimal, colorful, educational, child-friendly.`,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

// Update status when AI enabled changes
document.getElementById('aiEnabled').addEventListener('change', () => {
  const settings = getAISettingsFromForm();
  persistAISettings(settings, false);
});

document.getElementById('aiProvider').addEventListener('change', () => {
  persistAISettings(getAISettingsFromForm(), false);
});
document.getElementById('aiMnemonics').addEventListener('change', () => {
  persistAISettings(getAISettingsFromForm(), false);
});
document.getElementById('aiSentences').addEventListener('change', () => {
  persistAISettings(getAISettingsFromForm(), false);
});
document.getElementById('aiImages').addEventListener('change', () => {
  persistAISettings(getAISettingsFromForm(), false);
});
document.getElementById('aiApiKey').addEventListener('blur', () => {
  persistAISettings(getAISettingsFromForm(), false);
});
