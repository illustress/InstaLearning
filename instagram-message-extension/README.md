# InstaLearning Chrome Extension

## Smoke Test Checklist (Chrome)

### 1. Load the extension
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `instagram-message-extension`.
4. Pin the extension so the popup is easy to open.

Expected:
- Extension loads without errors in `chrome://extensions`.
- Popup opens and shows `Settings`, `Words`, `Stats` tabs.

### 2. Basic settings persistence
1. Open popup `Settings`.
2. Set frequency to `2`, direction to `Mixed (Both)`.
3. Click **Save Settings**.
4. Close popup and open again.

Expected:
- Values remain `2` and `Mixed (Both)`.
- A settings status message appears in the settings panel.

### 3. Word import and safe rendering
1. Create a CSV with:
   - Header: `german,dutch`
   - Row 1: `Hund,Hond`
   - Row 2: `"<img src=x onerror=alert(1)>",Kat`
2. In popup `Words`, import the CSV.
3. Open the word list.

Expected:
- Import success message appears.
- The `<img ...>` text is shown as plain text, not rendered as HTML.
- No alert/pop-up script executes.

### 4. Reset words and reset progress behavior
1. In `Words`, click **Reset to Default**.
2. In `Stats`, click **Reset All Progress**.
3. Reopen popup and check `Stats`.

Expected:
- Word list reverts to defaults.
- Stats reflect reset levels (all words effectively Level 1).
- Status message appears in the correct panel (`Words` or `Stats`).

### 5. Story/Reel context gating
1. Go to `https://www.instagram.com/` (feed or non-story/non-reel area).
2. Press arrow keys multiple times.

Expected:
- No quiz overlay appears outside Stories/Reels context.

### 6. Quiz trigger in learning context
1. Navigate to a Story or Reel URL (logged-in flow works best).
2. With frequency set to `2`, perform two valid navigation actions (story taps/swipes, reel scrolls, or arrows in context).

Expected:
- Quiz overlay appears on schedule.
- Level badge and question text render correctly.

### 7. Level 4 skip/timer stability regression check
1. Continue answering correctly until any word reaches Level 4 (or use existing progressed data).
2. When a speed round appears, click **Skip** immediately.
3. Stay on page for at least 6 seconds.

Expected:
- Overlay closes cleanly.
- No crash, freeze, or broken quiz state.
- Next quiz can still appear later.

### 8. Import/reset sync across active Instagram tab
1. Keep an Instagram tab open with extension active.
2. In popup, import words or reset words/progress.
3. Continue using quizzes in the same tab.

Expected:
- Active tab uses updated words/progress without requiring page reload.
- Progress does not revert to old pre-reset values.

## Quick Pass Criteria
- No console errors from extension scripts during the above checks.
- No HTML/script injection from imported CSV values.
- No quizzes outside Story/Reel contexts.
- No Level 4 skip timer crash.
- Import/reset/progress changes stay in sync across popup and active content script.
