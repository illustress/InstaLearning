# InstaLearning Chrome/Firefox Extension

Learn German-Dutch vocabulary while scrolling Instagram stories and reels.

## Features

- 🎯 Multiple quiz types (multiple choice, typing, speed rounds)
- 🎮 Mini-games (Hangman, Word Scramble, Match Pairs)
- 💰 Credit system - earn credits by learning, spend them scrolling
- 🔥 Streak bonuses for consecutive correct answers
- 🤖 AI-powered cards with mnemonics and smart sentences
- 📊 Progress tracking and statistics
- 📱 Works on mobile (Firefox Android)

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `instagram-message-extension` folder
6. Open Instagram and start learning!

### Firefox Desktop

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `manifest.json` from the extension folder
5. Open Instagram and start learning!

Note: Temporary add-ons are removed when Firefox restarts. For permanent installation, submit to [addons.mozilla.org](https://addons.mozilla.org).

### Firefox Android (Nightly)

1. Install **Firefox Nightly** from Play Store
2. Open Firefox Nightly, go to `about:config`
3. Search `xpinstall.signatures.required` → set to `false`
4. Search `extensions.experiments.enabled` → set to `true`
5. Go to `about:debugging`
6. Tap **This Firefox** → **Load Temporary Add-on**
7. Navigate to the extension folder and select `manifest.json`

### Firefox Android (Stable) - Custom Collection Method

1. Create account at [addons.mozilla.org](https://addons.mozilla.org)
2. Zip the extension folder (select all files, not the folder itself)
3. Go to https://addons.mozilla.org/developers/addon/submit/distribution
4. Choose **On your own** → Upload the zip
5. Create a **Collection** and add your extension
6. On Android Firefox:
   - Settings → About Firefox → Tap Firefox logo 5 times
   - Settings → Custom Add-on collection
   - Enter your User ID and Collection name
7. Go to Add-ons menu → Install your extension

## Creating the ZIP for Firefox

**Important:** The zip must contain files at the root, not inside a folder.

**Windows (PowerShell):**
```powershell
Compress-Archive -Path .\instagram-message-extension\* -DestinationPath instalearning.zip
```

**Mac/Linux:**
```bash
cd instagram-message-extension
zip -r ../instalearning.zip *
```

## AI Cards Setup (Optional)

1. Open the extension popup → **AI** tab
2. Select provider (OpenAI or Anthropic)
3. Enter your API key
4. Enable AI Cards
5. Click **Generate All Cards** to pre-generate content
6. Cards will show mnemonics and smart sentences during quizzes

Cost: ~$0.10 for 100 words (one-time, cached forever)

## CSV Import Format

Import custom word lists via the **Words** tab:

```csv
German,Dutch
Hund,Hond
Katze,Kat
Haus,Huis
```

## Smoke Test Checklist

### 1. Load extension

1. Load extension in browser
2. Open popup and verify tabs render (Settings, Words, AI, Stats)

Expected: Extension loads without runtime errors.

### 2. Settings and live sync

1. In popup Settings, set direction to Mixed (Both) and click **Save Settings**
2. Keep an Instagram tab open and trigger a quiz

Expected: Saved direction persists after reopening popup.

### 3. CSV import safety

1. Import a CSV with a row like: `"<img src=x onerror=alert(1)>",Kat`
2. Open Words list and run quizzes

Expected: Imported text displays as plain text, no script execution.

### 4. Credits and swipe gating

1. In Stories/Reels, answer one quiz correctly
2. Confirm credits increase
3. Keep swiping

Expected: Swipes consume credits. When credits reach 0, quiz appears.

### 5. AI Cards

1. Configure API key in AI tab
2. Generate cards for a few words
3. Check Words tab for 🤖 indicators
4. Click a word to preview the AI card

Expected: Mnemonic and sentences display correctly.

### 6. Mini-games

1. Try Hangman with accented characters (ü, ß, ä, ö)
2. Try Match game with small word list (1-3 pairs)

Expected: Games are completable with available data.

## Troubleshooting

**"Extension damaged" in Firefox:**
- Make sure zip contains files at root (not nested in folder)
- Validate manifest.json syntax at [jsonlint.com](https://jsonlint.com)

**Quiz not appearing:**
- Refresh the Instagram tab after installing/updating extension
- Check browser console for errors

**AI cards not showing:**
- Verify API key is correct (test with Test Connection button)
- Make sure AI is enabled and cards are pre-generated
