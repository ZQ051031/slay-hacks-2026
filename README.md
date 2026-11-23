# QuizForge

QuizForge is a personal study companion that turns your own notes into a revision quiz and a daily spaced-repetition plan. Rereading notes makes them feel familiar without showing what you can actually recall. QuizForge gives you a way to test that recall and brings the material back when it’s due.

Built for **SLAY HACKS 2026** (Nov 7 – Dec 7, 2026). Submission deadline: **Dec 7, 2026 at 5:00 PM EST / Dec 8, 2026 at 06:00 CST** (China Standard Time).

## Run locally

Requires Node.js 22 or later. No npm install, account, network access, or API key is needed once you have the repository.

```sh
git clone https://github.com/ZQ051031/slay-hacks-2026.git
cd slay-hacks-2026
npm start
```

Open **http://127.0.0.1:3000**. The Node server serves static assets only; no notes or results are sent to it. To change the port: `PORT=3100 npm start`.

## Try the demo

1. In **Notes**, paste text, upload a `.txt`, `.md`, or `.markdown` file, or pick **Photosynthesis**, **The French Revolution**, or **Number Systems**. Markdown headings become topics.
2. Click **Generate quiz**. Answer multiple-choice, true/false, and short-answer prompts. After each answer, check the quoted source and continue to see your final score.
3. Open **Review**. Generated cards are initially due today. Reveal an answer and choose **Again**, **Hard**, **Good**, or **Easy** to move the card to its next due date. Once you rate a card, the app shows that date and advances to the next due card.
4. Open **Progress** to see your review streak, cards due today (including overdue cards), and topic mastery. Notes, cards, and review dates stay in this browser’s localStorage. Refreshing keeps them; clearing site data removes them. The current quiz attempt is not stored.

### How the AI works

QuizForge uses an offline, rule-based text engine rather than a language model. It splits notes on lines and sentence boundaries, assigns passages to headings, and looks for bold or inline-code key terms, definition subjects, and then distinctive longer words. It blanks out a term in the original excerpt and rotates through these formats:

- **Multiple choice:** The blank has one source answer and up to three distinct distractors drawn from elsewhere in the notes. If there is no usable distractor, the engine can use short answer instead.
- **True/false:** The prompt checks whether a proposed term fills the blank in that exact excerpt. A distractor is not presented as a real-world fact.
- **Short answer:** A typed answer is checked against the original term, ignoring case, repeated whitespace, and trailing sentence punctuation.

Every explanation quotes the supporting excerpt. The engine does not look up facts or validate the accuracy of the notes. It works best with short, complete sentences or definitions, and may produce fewer formats or cards for very short or unstructured notes. It generates at most 12 questions per quiz.

### How scheduling works

QuizForge uses an SM-2-style adaptation. **Again** resets successful repetitions and schedules the card for tomorrow. **Hard** grows the interval slowly and lowers the ease factor. **Good** starts at one day, then six days, then grows the interval by ease. **Easy** grows the interval faster and raises ease. The queue uses local calendar dates, and only review ratings change the schedule; quiz scores do not. A card counts as mastered while its current interval is at least 21 days.

## Test

Use Node.js 22+ and Google Chrome or Chromium for the full suite. No npm packages are needed. If the browser executable isn’t named `google-chrome`, set `CHROME_BIN` to its path.

```sh
npm run build
npm test
# Example with Chromium:
CHROME_BIN=/usr/bin/chromium npm test
```

The build checks the JavaScript syntax; there is no bundle step. The tests cover note grounding, answer options, ratings and due dates, and a headless-browser flow through Notes, Quiz, Review, and Progress.

## Project structure

```text
public/            HTML, CSS, and browser UI
lib/quiz.js        Extractive quiz generation and answer checking
lib/scheduler.js   Review ratings, due dates, and progress calculations
lib/storage.js     Browser localStorage adapter
server.js          Static file server
examples/          Three sample note sets
test/              Unit tests and headless browser smoke test
docs/screenshots/  Suggested home for submission screenshots
DEMO_SCRIPT.md     Timed recording guide
```

## Prepare screenshots for submission

Run through a sample quiz and save screenshots in `docs/screenshots/`. Suggested shots: `01-notes.png` with an example loaded, `02-quiz-feedback.png` showing the answer and source excerpt, `03-review.png` after rating a card, and `04-progress.png` with the topic and streak visible. Use sample notes rather than personal material. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a 3-minute recording plan.

MIT licensed. See [LICENSE](LICENSE).
