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
**P0** — none. All 46/46 backend + ~95% frontend testids passing.
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
