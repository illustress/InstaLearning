// InstaLearning - AI-Powered Personalized Cards
// Generates visual cards, smart sentences, and mnemonics using AI

const AI_CARD_CACHE_KEY = 'aiCardCache';
const AI_SETTINGS_KEY = 'aiSettings';

// HTML escaping for safe rendering
function escapeHtmlAI(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Default AI settings
const DEFAULT_AI_SETTINGS = {
  enabled: false,
  apiKey: '',
  provider: 'openai', // 'openai' or 'anthropic'
  model: 'gpt-4o-mini',
  generateImages: true,
  generateMnemonics: true,
  generateSentences: true,
  cacheCards: true
};

let aiSettings = { ...DEFAULT_AI_SETTINGS };
let aiCardCache = {};

// Load AI settings and cache
async function loadAISettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([AI_SETTINGS_KEY], (syncData) => {
      if (syncData[AI_SETTINGS_KEY]) {
        aiSettings = { ...DEFAULT_AI_SETTINGS, ...syncData[AI_SETTINGS_KEY] };
      }

      chrome.storage.local.get([AI_CARD_CACHE_KEY], (localData) => {
        if (localData[AI_CARD_CACHE_KEY]) {
          aiCardCache = localData[AI_CARD_CACHE_KEY];
        }
        resolve();
      });
    });
  });
}

function startAIStorageListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[AI_SETTINGS_KEY]) {
      aiSettings = { ...DEFAULT_AI_SETTINGS, ...(changes[AI_SETTINGS_KEY].newValue || {}) };
      console.log('[InstaLearning] AI settings updated:', aiSettings.enabled);
    }

    if (area === 'local' && changes[AI_CARD_CACHE_KEY]) {
      aiCardCache = changes[AI_CARD_CACHE_KEY].newValue || {};
    }
  });
}

function saveAISettings() {
  chrome.storage.sync.set({ [AI_SETTINGS_KEY]: aiSettings });
}

function saveAICardCache() {
  // Limit cache size to prevent storage quota issues
  const cacheKeys = Object.keys(aiCardCache);
  if (cacheKeys.length > 100) {
    const keysToRemove = cacheKeys.slice(0, cacheKeys.length - 100);
    keysToRemove.forEach(k => delete aiCardCache[k]);
  }
  chrome.storage.local.set({ [AI_CARD_CACHE_KEY]: aiCardCache });
}

// Generate cache key for a word
function getCardCacheKey(word) {
  return `${word.german}_${word.dutch}`.toLowerCase().replace(/\s+/g, '_');
}

// Check if we have a cached card
function getCachedCard(word) {
  if (!aiSettings.cacheCards) return null;
  const key = getCardCacheKey(word);
  return aiCardCache[key] || null;
}

// Save card to cache
function cacheCard(word, card) {
  if (!aiSettings.cacheCards) return;
  const key = getCardCacheKey(word);
  aiCardCache[key] = { ...card, cachedAt: Date.now() };
  saveAICardCache();
}


// ============ AI API CALLS ============

async function callOpenAI(messages, options = {}) {
  if (!aiSettings.apiKey) {
    throw new Error('API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiSettings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model || aiSettings.model,
      messages,
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(messages, options = {}) {
  if (!aiSettings.apiKey) {
    throw new Error('API key not configured');
  }

  // Convert OpenAI format to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMsgs = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': aiSettings.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: options.model || 'claude-3-haiku-20240307',
      max_tokens: options.maxTokens || 500,
      system: systemMsg,
      messages: userMsgs.map(m => ({ role: m.role, content: m.content }))
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

async function callAI(messages, options = {}) {
  if (aiSettings.provider === 'anthropic') {
    return callAnthropic(messages, options);
  }
  return callOpenAI(messages, options);
}

// ============ CARD GENERATION ============

// Generate a mnemonic for remembering the word pair
async function generateMnemonic(word) {
  const prompt = `Create a memorable, fun mnemonic to help remember that the German word "${word.german}" translates to the Dutch word "${word.dutch}".

Rules:
- Use sound associations, visual imagery, or wordplay
- Keep it short (1-2 sentences max)
- Make it memorable and slightly silly/funny
- Connect the sounds or spellings of both words

Return ONLY the mnemonic, nothing else.`;

  const messages = [
    { role: 'system', content: 'You are a creative language learning assistant that creates memorable mnemonics.' },
    { role: 'user', content: prompt }
  ];

  return callAI(messages, { maxTokens: 100, temperature: 0.9 });
}

// Generate contextual example sentences
async function generateSmartSentences(word, userContext = {}) {
  const level = userContext.level || 1;
  const recentWords = userContext.recentWords || [];
  
  let prompt = `Create 2 example sentences for the German word "${word.german}" (meaning: ${word.dutch} in Dutch).

Requirements:
- Difficulty: ${level <= 2 ? 'A1-A2 (beginner)' : 'B1 (intermediate)'}
- Keep sentences short and practical
- Use everyday situations`;

  if (recentWords.length > 0) {
    prompt += `\n- Try to naturally include one of these recently learned words if possible: ${recentWords.slice(0, 3).join(', ')}`;
  }

  prompt += `\n\nReturn as JSON: {"sentence1": "...", "sentence1_translation": "...", "sentence2": "...", "sentence2_translation": "..."}`;

  const messages = [
    { role: 'system', content: 'You are a German language teacher. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ];

  const response = await callAI(messages, { maxTokens: 200, temperature: 0.7 });
  
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from response
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  }
}

// Generate image prompt for the word (to use with DALL-E or similar)
async function generateImagePrompt(word) {
  const prompt = `Create a simple, clear image description for the word "${word.german}" (${word.dutch}).

Requirements:
- Describe a single, clear visual that represents the word
- Use simple, concrete imagery
- Style: cute, colorful, cartoon-like illustration
- Keep it under 50 words

Return ONLY the image description, nothing else.`;

  const messages = [
    { role: 'system', content: 'You create concise image prompts for vocabulary flashcards.' },
    { role: 'user', content: prompt }
  ];

  return callAI(messages, { maxTokens: 80, temperature: 0.8 });
}

// Generate actual image using DALL-E
async function generateImage(imagePrompt) {
  if (!aiSettings.apiKey || aiSettings.provider !== 'openai') {
    return null; // Image generation only works with OpenAI
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiSettings.apiKey}`,
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
    return data.data[0]?.url || null;
  } catch {
    return null;
  }
}


// ============ MAIN CARD GENERATION ============

// Generate a complete AI-enhanced card for a word
async function generateAICard(word, userContext = {}) {
  if (!aiSettings.enabled || !aiSettings.apiKey) {
    return null;
  }

  // Check cache first
  const cached = getCachedCard(word);
  if (cached) {
    return cached;
  }

  const card = {
    german: word.german,
    dutch: word.dutch,
    emoji: word.emoji || '',
    originalExample: word.example || '',
    mnemonic: null,
    smartSentences: null,
    imageUrl: null,
    imagePrompt: null,
    generatedAt: Date.now()
  };

  const promises = [];

  // Generate mnemonic
  if (aiSettings.generateMnemonics) {
    promises.push(
      generateMnemonic(word)
        .then(m => { card.mnemonic = m; })
        .catch(() => {})
    );
  }

  // Generate smart sentences
  if (aiSettings.generateSentences) {
    promises.push(
      generateSmartSentences(word, userContext)
        .then(s => { card.smartSentences = s; })
        .catch(() => {})
    );
  }

  // Generate image (prompt first, then optionally the actual image)
  if (aiSettings.generateImages) {
    promises.push(
      generateImagePrompt(word)
        .then(async (prompt) => {
          card.imagePrompt = prompt;
          // Optionally generate actual image (expensive, so disabled by default)
          // const imageUrl = await generateImage(prompt);
          // if (imageUrl) card.imageUrl = imageUrl;
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);

  // Cache the result
  cacheCard(word, card);

  return card;
}

// Pre-generate cards for multiple words (batch operation)
async function pregenerateCards(words, userContext = {}, onProgress = null) {
  const results = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Skip if already cached
    if (getCachedCard(word)) {
      results.push({ word, status: 'cached' });
      continue;
    }

    try {
      const card = await generateAICard(word, userContext);
      results.push({ word, status: 'generated', card });
      
      if (onProgress) {
        onProgress(i + 1, words.length, word);
      }

      // Rate limiting - wait between requests
      if (i < words.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      results.push({ word, status: 'error', error: error.message });
    }
  }

  return results;
}

// ============ UI HELPERS ============

// Render an AI card as HTML
function renderAICard(card, options = {}) {
  if (!card) return '';

  const showImage = options.showImage !== false && card.imagePrompt;
  const showMnemonic = options.showMnemonic !== false && card.mnemonic;
  const showSentences = options.showSentences !== false && card.smartSentences;

  let html = '<div class="il-ai-card">';

  // Image placeholder or actual image
  if (showImage) {
    if (card.imageUrl) {
      html += `<div class="il-ai-image"><img src="${escapeHtmlAI(card.imageUrl)}" alt="${escapeHtmlAI(card.german)}"></div>`;
    } else {
      html += `<div class="il-ai-image-placeholder" title="${escapeHtmlAI(card.imagePrompt)}">🎨 ${escapeHtmlAI(card.emoji || '📝')}</div>`;
    }
  }

  // Mnemonic
  if (showMnemonic) {
    html += `<div class="il-ai-mnemonic">
      <span class="il-ai-label">💡 Memory Trick</span>
      <p>${escapeHtmlAI(card.mnemonic)}</p>
    </div>`;
  }

  // Smart sentences
  if (showSentences && card.smartSentences) {
    html += `<div class="il-ai-sentences">
      <span class="il-ai-label">📝 Examples</span>`;
    
    if (card.smartSentences.sentence1) {
      html += `<p class="il-ai-sentence">${escapeHtmlAI(card.smartSentences.sentence1)}</p>
        <p class="il-ai-translation">${escapeHtmlAI(card.smartSentences.sentence1_translation || '')}</p>`;
    }
    if (card.smartSentences.sentence2) {
      html += `<p class="il-ai-sentence">${escapeHtmlAI(card.smartSentences.sentence2)}</p>
        <p class="il-ai-translation">${escapeHtmlAI(card.smartSentences.sentence2_translation || '')}</p>`;
    }
    
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// Get user context for personalization
function getUserContextForAI() {
  const recentWords = [];
  
  // Get recently practiced words from progress
  if (typeof wordProgress !== 'undefined') {
    const sortedByRecent = Object.entries(wordProgress)
      .filter(([, p]) => p.correct > 0)
      .sort((a, b) => (b[1].lastPracticed || 0) - (a[1].lastPracticed || 0))
      .slice(0, 5);
    
    sortedByRecent.forEach(([idx]) => {
      const word = words[parseInt(idx)];
      if (word) recentWords.push(word.german);
    });
  }

  return {
    level: typeof currentLevel !== 'undefined' ? currentLevel : 1,
    recentWords,
    streak: typeof streak !== 'undefined' ? streak : 0
  };
}

// Initialize AI cards module
async function initAICards() {
  await loadAISettings();
  startAIStorageListeners();
  console.log('[InstaLearning] AI Cards initialized, enabled:', aiSettings.enabled);
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.InstaLearningAI = {
    initAICards,
    generateAICard,
    pregenerateCards,
    renderAICard,
    getUserContextForAI,
    getCachedCard,
    get settings() { return aiSettings; },
    set settings(val) { 
      aiSettings = { ...DEFAULT_AI_SETTINGS, ...val }; 
      saveAISettings();
    }
  };
}
