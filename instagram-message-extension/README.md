# InstaLearning Chrome Extension

## Smoke Test Checklist (Chrome)

### 1. Load extension
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `instagram-message-extension`.
4. Open popup and verify tabs render (`Settings`, `Words`, `Stats`).

Expected:
- Extension loads without runtime errors.

### 2. Settings and live sync
1. In popup `Settings`, set direction to `Mixed (Both)` and click **Save Settings**.
2. Keep an Instagram tab open and trigger a quiz.

Expected:
- Saved direction persists after reopening popup.
- Active tab follows updated direction rules without a page reload.

### 3. CSV import safety
1. Import a CSV in `Words` with a row like:
   - `"<img src=x onerror=alert(1)>",Kat`
2. Open `Words` list and run quizzes.

Expected:
- Imported text is displayed as plain text.
- No HTML/script executes in popup or quiz overlay.

### 4. Credits and swipe gating
1. In Stories/Reels, answer one quiz correctly.
2. Confirm credits increase.
3. Keep swiping in Stories/Reels.

Expected:
- Swipes consume credits.
- When credits reach `0`, quiz appears again.

### 5. Hangman accented-letter behavior
1. Start Hangman mini-game repeatedly until a word with characters like `ü`, `ß`, `ä`, `ö` appears.
2. Complete the game.

Expected:
- Those letters are guessable from the keyboard.
- Win condition works for accented words.

### 6. Match game with small custom list
1. Import a CSV with only 1-3 word pairs.
2. Start Match mini-game.

Expected:
- Game remains winnable (target pairs adapt to available words).
- Completing all shown pairs ends the game as correct.

### 7. Reset flows
1. In `Words`, click **Reset to Default**.
2. In `Stats`, click **Reset All Progress**.

Expected:
- Words reset to defaults.
- Progress/credits/streak/sessions reset.
- Status message appears in the correct tab panel.

## Quick Pass Criteria
- No extension console errors during all steps.
- No HTML/script injection from CSV or stored values.
- Hangman and Match mini-games are always completable for available data.
- Popup status messages appear in the intended panel.
