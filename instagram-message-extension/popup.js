document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('message');
  const frequencyInput = document.getElementById('frequency');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['message', 'frequency'], (data) => {
    if (data.message) messageInput.value = data.message;
    if (data.frequency) frequencyInput.value = data.frequency;
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const message = messageInput.value.trim();
    const frequency = parseInt(frequencyInput.value) || 3;

    chrome.storage.sync.set({ message, frequency }, () => {
      status.textContent = '✓ Saved! Refresh Instagram to apply.';
      setTimeout(() => status.textContent = '', 3000);
    });

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('instagram.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED', message, frequency });
      }
    });
  });
});
