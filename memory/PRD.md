# PRD — Jade Haul (a JadeOS Product)

## Original problem statement (verbatim summary)
Build a Trucker assistance app with JadeOS branding that is visually stunning, easy to operate, and robust. Modeled on Samsara / Motive / Geotab but with broker-side AI agent (JADE) capabilities. Plus: detention timer, theme changer, bill scanner, Drivewyze-style weigh-station bypass, 3D GPS map with turn-by-turn, voice JADE Claude assistant for the entire platform, facial-recognition login with Apple-Watch-style holo orb, AI trip planning suggesting breaks/meals/parking/HOS compliance.

Phase 2 adds: widget integration framework (mirror other company apps via iframe), public shipper tracking, Stripe/QuickBooks settlements UI, websocket dispatch comms, true-3D HUD tilt on GPS map.

Phase 3 adds: editable ELD logs, manual trip builder, maintenance ledger, document vault, fuel-receipt scanner with IFTA roll-up + auto-prompt at gas stations, GPS auto-detect on-site → auto-cue detention, interactive US weigh-station map, AI companion banner with proactive tips, moving driver marker on GPS, and **OpenAI Nova TTS** as Jade's voice (replaces robotic browser WebSpeech).

## Personas
- **Driver (Marcus Reyes)** — OTR CDL driver. Cares about HOS clock, fuel efficiency, detention pay, ETAs, voice control.
- **Broker (Aria Chen)** — Atlas Freight dispatcher. Cares about MTD revenue, on-time %, carrier risk, quote margins, exceptions.

## Architecture
- Backend: FastAPI `/app/backend/server.py` + `/app/backend/routes/{tts,phase3}.py` on :8001, all routes `/api/*`, MongoDB-backed.
- Frontend: React 19 + CRA + Tailwind + shadcn UI + react-leaflet + recharts + framer-motion.
- LLM: Claude Sonnet 4.5 + GPT-4o vision + **OpenAI Nova TTS** via `emergentintegrations` + `EMERGENT_LLM_KEY`.
- Voice: Nova TTS streams MP3 from `/api/tts/speak`; STT remains browser WebSpeech (future Whisper).

## Implemented modules
### Driver
- Holo-orb biometric login + lime "Launch Cockpit" CTA
- **AI Companion Banner** — proactive tips spoken in Nova voice every 45s
- Command Dashboard — KPIs + 3D HUD map (with animated driver marker) + JADE orb + active load + predictive maintenance + ELD + comms + connected widgets row
- **Trip Builder** — manual route + stops + commodity + hazmat + planned start; saves to DB
- Split GPS / ELD cockpit (true-3D tilt)
- **Editable ELD logs** — full CRUD with status select + datetime + location + notes
- **Detention Timer + Auto Geofence Detect** — Switch + simulated geofence cycle that auto-cues timer on-site
- Bill / BOL scanner (GPT-4o vision)
- **Fuel Receipts + IFTA** — scanner + auto-prompt + per-state gallons/$ roll-up
- **Maintenance Ledger** — CRUD with category/severity/odo/due-in-miles/cost/completed
- **Documents Vault** — upload BOL/CDL/INSURANCE/PERMIT/INSPECTION/RECEIPT/OTHER with view/delete
- **Interactive US Weigh-Station Map** — 20-station sample, Leaflet, BYPASS/PULL_IN markers + clickable list
- JADE voice (Nova TTS) — text chat + STT mic + suggestion chips, mute toggle
- Safety scorecard (radial + 7-day trend)
- Load board
- Comms hub + **Live Dispatch (WebSocket)**
- **Settlements** (driver pay) — Stripe + QuickBooks connection state

### Broker
- Command Center (KPIs + 14-day revenue + lanes bar + live shipments)
- Quote Optimizer (JADE AI lane pricing)
- Carrier Risk table
- Exception Queue + AI suggestions
- **Settlements (payouts)** + **Live Dispatch (WebSocket)**

### Shared
- 5 mood themes (Jade / Midnight / Sunset / Storm / Aurora) via `data-theme`
- **Integration Widget Framework** — connect Samsara / Motive / Geotab / Lytx / McLeod / Loadsmart / Navisphere / DAT / Drivewyze / QuickBooks / Stripe / Trimble or any custom URL; opens as embedded iframe widget
- **Public Shipper Tracking Portal** `/track/:loadId` — no auth, brandable
- Sidebar with Jade Haul mark + "NEW" lime pill on Integrations

## Mocked / future integration points
- **Live Drivewyze API** — exposed via Integrations catalog, real API hookup deferred to partner cert.
- **OpenAI Whisper STT** — frontend still uses browser WebSpeech for STT; backend route reserved.
- **Real GPS** — current movement is simulated; production = `navigator.geolocation.watchPosition`.
- **ELD hardware bus** — no real vehicle bus connection; FMCSA cert work needed.
- **iframe blocking** — some integration providers send X-Frame-Options DENY; user gets a "open in new tab" fallback.

## Backlog
**P0** — none. Wrap-up verified Iter 4 (Feb 2026): 56/56 backend pytest + 100% frontend P0 flows, 0 console errors, useSafeFetch AbortController confirmed canceling in-flight requests on unmount.
**P1**
- Mobile-native shell (Capacitor) for in-cab tablet
- Multi-tenant tenancy (org_id everywhere)
- Live Drivewyze cert + real API
- Whisper STT server-side
- Push notifications (Service Worker)
**P2**
- Predictive maintenance ML w/ real telemetry
- Public branded shipper portal (per-tenant domain)
- Driver leaderboard + rewards storefront
- Smart load matching ML on lane history
- Cluster weigh-station markers when dataset > 50

## Test credentials
- Driver: `driver@jadeos.com / jade123`
- Broker: `broker@jadeos.com / jade123`

## Test history
- Iter 1 (Feb 2026) — Backend 21/21, caught P0 Leaflet StrictMode bug.
- Iter 2 (Feb 2026) — Frontend 100% pass after StrictMode fix + Jade Haul rebrand.
- Iter 3 (Feb 2026) — Backend 32/32 + full Phase 2 (integrations, public track, settlements, dispatch).
- Iter 3 (re-run, Phase 3) — Backend 46/46, frontend ~95% (2 minor testid gaps, fixed post-test).
- Iter 4 (Feb 2026, wrap-up) — Backend 56/56 pytest (10 new phase4 wrap tests added in `/app/backend/tests/test_phase4_verify.py`). Frontend: all P0 performance fixes verified — rapid switching across 9 driver tabs clean, window blur/focus cycles trigger no excess refetches, useSafeFetch correctly aborts in-flight `/api/tts/speak` on unmount. JADE chat + Nova TTS + POI overlays + Voice Trip Wizard end-to-end green. 0 console errors across full driver+broker walkthrough.

## Broker Watch · Fleet Control Tower (Feb 2026)
- `/broker/watch` — CARTO dark map + KPI strip + fleet ticker + click-through
- `GET /api/broker/watch` — aggregated fleet snapshot (KPIs + drivers)
- `GET /api/broker/watch/{email}` — full driver detail (workflow, events, alerts, recent pings)
- `POST /api/broker/ping-driver` — broker → driver two-way messaging with optional TTS voice nudge
- `DriverDetailPanel.jsx` — slide-in from right with workflow / cabin events (thumbnails) / open alerts / ping composer with 4 quick templates + voice toggle
- Live poll every 6s; recent-pings collapsible; scrim dismiss; spring-in animation

## Sim Recap (Feb 2026)
- `GET /api/simulation/recap` — KPIs + Claude 4.5 debrief (route summary / what went well / sharpen next / send-off)
- `SimRecap.jsx` — full-screen fade-in modal, trophy hero, 6 KPI tiles, TTS narration, Share, once-per-sim gating via localStorage

## Sample Trucker Simulation (Feb 2026)
- `POST /api/simulation/start` — creates a fresh demo user + trip, kicks off background sim loop
- Fort Worth → Phoenix route, 1050 mi over ~90 sec real time, cabin events + alerts + workflow auto-complete
- `SimulationHUD.jsx` top-center pill with progress + Stop
- Login page "Try a sample trucker simulation" CTA

## Companion + Alerts + Workflow (Feb 2026)
- `JadeCompanion.jsx` — global orb w/ real-time voice (WebSpeech STT → Claude → Nova TTS), ambient small-talk after 5 min idle, alert popup renderer
- `JadeAmbientGlow.jsx` — screen-edge illumination + scan lines while JADE is thinking
- `WorkflowPage.jsx` — AI-orchestrated load checklist (10 canonical steps)
- Ambient simulator: 1 alert every 180-300s, cabin events every 35-55s

## Themes (Feb 2026)
- 15 palettes: Calafia, HUD Cyan, Forest Calm, Sunset Warm, Arctic, Lavender, Mocha, Solar Light, Orisei Brand, Neon Tokyo, Matrix Green, Amber CRT, Midnight Steel, Rose Quartz, Carbon Fiber
- `ThemeSwitcher.jsx` popover in sidebar; instantly repaints entire app via `data-theme`
- Ambient glow, alerts, HUD all follow active palette

## Face Login Reliability (Feb 2026)
- Models preloaded on app boot (`preloadFaceModels` in `App.js`)
- 5s + 3s auto-retry, 180ms poll, fast-accept threshold 0.42, general threshold 0.55
- Live confidence bar under holo-orb during scan
- Enrollment upgraded to 5 samples

## Last working item (resolved)
- P0 App Sluggishness / Excessive Re-renders — FIXED & VERIFIED (Iter 4). `useSafeFetch` (AbortController + alive ref), debounced AI Companion/geofence polling, and `React.memo` on Leaflet maps confirmed working under rapid navigation stress.

## Face biometric login (Feb 2026)
- **Engine**: `@vladmandic/face-api` (TensorFlow.js) running fully client-side. Models cached in `/app/frontend/public/models/` (tinyFaceDetector + faceLandmark68 + faceRecognition, ~13 MB total).
- **Helpers**: `/app/frontend/src/lib/faceAuth.js` — model loader, descriptor extraction, EAR (eye-aspect-ratio) liveness, descriptor averaging, localStorage I/O, best-match search (threshold 0.5).
- **Components**:
  - `FaceCapture.jsx` — reusable circular webcam with permission state surfacing (idle/requesting/ready/denied/error) + Enable Camera CTA.
  - `HoloOrb.jsx` — login orb refactored to expose `getVideoEl()` via ref and show graceful permission UI instead of silent OFFLINE.
- **Signup flow** (`/signup`): 2-step — credentials (name/email/password/role + optional callsign/license) → face enrollment (blink-liveness challenge, captures 3 descriptors, averages them).
- **Login flow**: existing email/password kept. New "Sign in with Face" button appears when any face is enrolled on this device.
- **Backend**: `POST /api/auth/signup` added — bcrypt-hashed password, MongoDB `users` collection (unique-email index), back-compat with hardcoded DEMO_USERS. `/auth/login` + `current_user` now resolve from both sources.

## BOL Scanner → Auto-Shipment + Trip Lifecycle (Feb 2026)
- **Endpoint**: `POST /api/shipments/scan-bol` — GPT-4o Vision reads a photographed BOL, returns strict JSON across ~50 fields (BOL/PRO/PO/pickup#/delivery#, shipper+address+contact+phone, consignee+address+contact+phone, broker, carrier+SCAC, trailer, pickup/delivery windows, commodity, pieces/pallets/weight/class/NMFC, hazmat + UN#, reefer temp, rate breakdown, declared value, payment terms, seal#, special instructions, line items, and best-effort lat/lng for origin+destination).
- Backend `_build_shipment_from_parse` converts extraction into a full shipment doc (id, load_id, origin/destination with coords, miles via haversine × 1.18 highway factor, rpm, ETA) and persists to `db.shipments`.
- Auto-activate flag deactivates other loads and sets `is_active=true` in one call.
- `GET /api/driver/active_load` now returns the driver's active DB shipment when present; falls back to demo payload otherwise.
- **Trip lifecycle endpoints**: `/api/shipments/trip/{start|pause|resume|end}` — tracks `trip_status` (NOT_STARTED / RUNNING / PAUSED / ENDED), accrues `trip_active_seconds` via anchor timestamps, appends `trip_events` history. `end` marks status DELIVERED and deactivates.
- **Frontend**:
  - `BillScannerPage.jsx` — dual "Scan BOL" and "Scan & Auto-Start Load" actions, full parsed shipment card with route hero + mini GPS map + IDs/Parties/Freight/Rate sections + hazmat + line items.
  - `TripControls.jsx` — reusable Start/Pause/Resume/End component with live H:MM:SS timer, badges per status, embedded inline in scanner (post-scan prompt) and DriverDashboard active-load card.
  - `DriverDashboard.jsx` — new "Scan BOL to start your day" CTA when no scanned shipment is active.
- Endpoints tested end-to-end via curl: scan→activate→start→pause→resume→end all succeed; `/driver/active_load` correctly reflects DB state.


## Nominatim Geocoding + JADE Voice Briefing (Feb 2026)
- **Geocoding**: `_nominatim_geocode(query)` + `_resolve_coords(...)` in `server.py`. Free OpenStreetMap Nominatim, no API key. Tries full address first, falls back to city+state+zip, then city+state, then GPT-provided lat/lng. Every query cached in `db.geocode_cache`. Uses `httpx.AsyncClient` (added to `requirements.txt`), respects Nominatim policy with `User-Agent: JadeHaul/1.0 (jadeos-bol-scan)`.
- `_build_shipment_from_parse` now async — resolves real OSM lat/lng for origin + destination on every BOL scan. Verified: Springfield IL, Ravenswood WV, Metropolis IL, American Fork UT all correctly geocoded.
- **JADE voice briefing**: `POST /api/shipments/briefing` — checks driver's shipment count for the current UTC day; first-of-day returns a Claude-Sonnet-4.5-generated 3-4-sentence flight-deck briefing (driver name + broker + origin→destination + miles + rpm + reefer temp + hazmat, ends with "Say 'start trip' when you're rolling"); subsequent scans return a concise chime ("BOL X locked in. Origin to Destination, N miles. Ready to roll?"). Graceful text-only fallback if Claude fails.
- Frontend `BillScannerPage.jsx` — after every successful `/shipments/scan-bol`, fires `/shipments/briefing` and pipes text through the existing `speak(text)` helper (Nova TTS via `/api/tts/speak`). Best-effort — silent failure if the browser blocks autoplay.

