// Shared constants for the GreenLens server and client. Single source of truth for timeouts and limits.

// One deadline covers the whole upstream model fallback chain on the server.
export const UPSTREAM_TIMEOUT_MS = 30000
// Timeout ordering, longest to shortest: client 45 s > server request 40 s (SERVER_TIMEOUT_MS) > upstream 30 s.
// The client must outlive the server so a server-side fallback or JSON 504 can still arrive. See server/config.js.
export const CLIENT_TIMEOUT_MS = 45000

export const MAX_TEXT_CHARS = 200
export const MAX_LOCATION_CHARS = 60
export const MAX_HISTORY_ITEMS = 5
export const QUEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
export const FALLBACK_LABEL = 'Prerecorded tip, not a live AI result'
export const NO_SOURCE_NOTE = 'No curated source covers your location'
