# AI disclosure

This document says where AI is used in Sustain-a-Pet, what data leaves the app, and how AI was used to build it.

## AI at runtime

AI is used in one feature: **GreenLens**, which suggests one small, safe real-world action from a photo and/or a short note.

- **Provider:** OpenRouter (`https://openrouter.ai`), which routes each request to a model.
- **Models, in order:** `nvidia/nemotron-3.5-super-vl:free` (NVIDIA Nemotron), then `google/gemma-4-31b-it:free` and `google/gemma-4-26b-a4b-it:free` (Google Gemma). `OPENROUTER_MODEL` can replace the first one. Details: [MODEL_CONFIG.md](MODEL_CONFIG.md#model-chain).
- **Task given to the model:** identify the object or situation; propose one safe action; explain why it helps; choose a category, difficulty and confidence (`high`, `medium` or `low`); optionally ask one clarifying question; optionally mention a recent quest. The prompt is in `SYSTEM_PROMPT` in `api/eco-quest.js`.
- **Output format:** JSON that must match `QUEST_SCHEMA` in `src/ecoQuest.js`.

### What the model does not do

- It does not set rewards. XP, coins and leaves come from the fixed table in `src/rewards.js`.
- It does not add links. Sources come from the curated list in `src/recyclingSources.js`.
- It does not confirm completion. The server checks each completion, and the user confirms it.
- It does not decide what counts as a duplicate or what the daily cap is.

### Output checks

Every model answer passes `validateQuest` before the user sees it. The checks clamp length, remove HTML and URLs, reject empty or wrong-typed fields and reject a short list of unsafe terms. Anything that fails is replaced by a labelled fallback. See [ARCHITECTURE.md](ARCHITECTURE.md#model-output-side).

Model answers can be wrong. The UI always shows the confidence label. Medium and low confidence show a caveat. A fallback tip is labelled "Prerecorded tip, not a live AI result".

### Fallback tips are not AI

When the model times out or fails, the app shows one of five hand-written tips from `src/ecoQuestFallbacks.js`. The tips are chosen by a fixed hash, not by a model. They are labelled as prerecorded in every response and in the UI.

### Non-AI parts of the app

The game engine, saves, reward table, curated links, duplicate checks, daily cap and token signing are ordinary code with no model involved.

## Data sent to the AI provider

GreenLens sends only what the request body contains. The client builds it in `buildBody` (`src/greenLensClient.js`).

| Data | Sent when | Notes |
| --- | --- | --- |
| Photo | The user takes or chooses a photo | Scaled to a longest edge of 1024 px and encoded as JPEG (quality 0.82) in the browser before upload. Faces, names and addresses in the photo are sent too. |
| Note | The user types one | Up to 200 characters. |
| Clarification answer | The user answers a clarifying question | Up to 200 characters. |
| Recent quests | The user has completed AI quests | Up to 5 items: title, category and completion date, taken from the device's own history. |
| Town or region | The user has typed one in the GreenLens screen | Free text, up to 60 characters. Stored on the device under `sustain-pet-greenlens-place`. Used for the model prompt and for curated links. |

These are not sent to the provider:

- the `clientId` (it goes only to the app's own server for the daily cap and duplicate checks),
- the game save, pet name, coins or other garden data,
- the quest token, except as part of the app's own completion request.

The server's own requests to OpenRouter carry generic headers (`HTTP-Referer: http://localhost`, `X-Title: eco-quest`). They carry no account or device identifier from the app.

### What the user is told

The privacy notice shown before the first GreenLens use (`PRIVACY_NOTICE` in `src/greenLensClient.js`) says that the photo or note is sent to OpenRouter and the AI model it routes to, only to write the tip, that their privacy terms apply, and to leave out faces, names and addresses. The user must acknowledge it before the capture screen opens. The notice does not yet mention the town or region field or the recent-quest history. See [ARCHITECTURE.md#known-limitations](ARCHITECTURE.md#known-limitations).

### What the app stores

- On the device: the acknowledgement flag, the optional town or region, the random `clientId`, and the quests in the save.
- On the server: nothing persistent. Logs record request metadata and never bodies, photos or notes. The completion ledger and rate limits are in memory.

### Upstream retention

The app does not control how OpenRouter or the routed model provider stores or uses requests. Check their current terms before running the app with real users.

## AI use in development

Git history records AI assistance through `Co-Authored-By` trailers that name Claude models. To list them, run `git log -i --grep='Co-Authored-By'`. This document records no count, because the count changes with each commit. These trailers come from Anthropic's Claude Code workflow and name the model that did the work.

- **Claude (Anthropic), via Claude Code:** wrote and edited application code, server code, tests, the eval set and these documents.
- **OpenAI Codex:** the repository contains a git stash labelled `codex-preserve-local-work-before-atharvahuja13-update`, referenced in `plans/animation-audit.md`. The repository does not record Codex's role beyond that label.
- **Human review:** not recorded in this repository. Maintainers should name who reviewed and can explain each part.

The mocked eval suite and the unit tests are the checks on AI-written code. They do not prove model quality. See the evaluation status in [MODEL_CONFIG.md](MODEL_CONFIG.md#evaluation).

## Limits of this disclosure

- Model names come from the code. The providers may change or retire a free model without notice. A fallback chain makes the feature keep working, but the model that answers can change.
- The list of development tools is based on commit trailers and labels in the repository. Other AI use may not appear there.
