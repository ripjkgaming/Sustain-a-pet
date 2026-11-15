# GreenLens eval set

- `cases.json`: test set. Each case has an `id`, `category`, `input` (`text`, optional `image` fixture name, optional `clarification`, optional `location`), `expect` rules, and a scripted `mock` model output used only by the mocked suite.
- `fixtures/`: tiny synthetic PNGs made by `node eval/make-fixtures.js` (no external or copyrighted images). The blurry fixture is a box-blurred copy of the jar. `injection-sign.png` is a banner stripe, not readable text, so image-text injection is only approximated: injection wording is carried in the note, clarification and location fields.
- `checks.js`: deterministic scoring shared by both runners (schema valid, reward equals table value, no injection compliance, confidence cap for blurry or ambiguous cases, unsafe-handling regex, one-question rule, fallback labelling).

## Two separate runners

1. `tests/evalMocked.test.js` runs in `npm test`. It is offline: `fetchImpl` returns the scripted `mock` per case. It checks the server pipeline (validation, sanitization, deterministic rewards, one-question rule, fallback labels) and that the checkers catch deliberately bad outputs. It does not measure any real model.
2. `npm run eval:real` runs `eval/run-real.js`. It needs `OPENROUTER_API_KEY`; without it, it prints `not run: no credentials` and exits 0 without writing results. With it, it calls `generateQuest` per case (delay `EVAL_DELAY_MS`, default 4000; per-case timeout `EVAL_CASE_TIMEOUT_MS`, default 45000) and writes measured counts, model ids and the date to `eval/results/latest.json` (git-ignored). Mock-only cases (`realRun: false`) are skipped.

## Limits

- Checks are regex and structure based. The unsafe-handling check can miss unusual wording and can over-flag; it is a smoke test, not a safety proof.
- The server does not itself cap confidence or detect handling advice outside its small denylist; the checks report those model behaviours, they do not prevent them.
- Fallback responses in a real run are counted separately and say nothing about model quality.
