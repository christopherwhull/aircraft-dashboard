Live Moving Map — Refactor

Overview

This document describes the new `live-moving-map-refactor` page and why the moving map code was refactored.

Why refactor

- The original `live-moving-map.html` contained large inline scripts that were hard to test and maintain.
- Repeated patterns (fetch timeouts, track drawing, marker lifecycle) made reasoning and fixing bugs difficult.
- The refactor extracts modular helpers into `public/js/live-moving-map-refactor.js` to enable safer iterative changes and easier unit testing.

What changed

- Moved core logic into `public/js/live-moving-map-refactor.js` and kept a minimal `live-moving-map-refactor.html` page that wires UI controls.
- Live marker cleanup: default behavior changed to non-strict (markers are kept until TTL expires) to avoid flapping when updates are missed.
- Live tracks are now appended into existing long-track groups rather than being replaced; when a track is persisted by the user it will also receive appended live segments.
- A UI toggle was added to enable/disable appending live segments into persisted tracks.
- Marker TTL is configurable from the refactor page UI (default 30s).
- `fetchTracksBatch` will attempt `/api/v2/track` POST and fall back to legacy `/api/track?hex=...&minutes=...` when the v2 endpoint is unavailable.

Files touched

- `public/js/live-moving-map-refactor.js` — main refactor logic, track fetch fallback, appending behavior, TTL handling.
- `public/live-moving-map-refactor.html` — small page, new UI controls for TTL and append toggle.

Notes & next steps

- Consider mirroring the UI controls and TTL behavior back into the main `live-moving-map.html` for parity.
- Add automated tests for `fetchTracksBatch` fallback behavior.
- If you want, I can open a PR on GitHub — I need the repository remote (owner/name) or permissions to create the PR.

