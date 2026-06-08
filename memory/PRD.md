# PRD — Jade Haul (a JadeOS Product)

## Original problem statement (verbatim summary)
Build a Trucker assistance app with JadeOS branding that is visually stunning, easy to operate, and robust. Modeled on Samsara / Motive / Geotab but with broker-side AI agent (JADE) capabilities. Must include: ELD/HOS compliance, real-time GPS dispatch, AI-powered safety dashcam, fuel/maintenance, driver behavior coaching, load board, shipper portal, payments, comms hub, integrations. Plus: detention timer w/ timestamps, theme changer, bill scanner to brokers, Drivewyze-style weigh-station bypass, large 3D GPS map w/ turn-by-turn, voice JADE Claude assistant for the entire platform, facial-recognition login with Apple-Watch-style holo orb, AI trip planning suggesting breaks/meals/parking/HOS compliance.

## Personas
- **Driver (Marcus Reyes)** — OTR CDL driver, runs reefer lane DAL → PHX. Cares about HOS clock, fuel efficiency, on-site detention, accurate ETAs, voice control while driving.
- **Broker (Aria Chen)** — Atlas Freight dispatcher. Cares about MTD revenue, on-time %, carrier risk, quote margins, exception resolution.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`) on :8001, all routes `/api/*`, MongoDB-backed.
- Frontend: React 19 + CRA + Tailwind + shadcn UI + react-leaflet + recharts + framer-motion. Theme via `data-theme` on `<html>`.
- LLM: Claude Sonnet 4.5 + GPT-4o vision via `emergentintegrations` + `EMERGENT_LLM_KEY`.
- Voice: Browser WebSpeech (SpeechRecognition + SpeechSynthesis) — STT/TTS upgrade path to OpenAI Whisper / TTS reserved.

## Implemented (Feb 2026)
### Driver side
- Holo-orb biometric login (webcam masked in circle + scanning rings + progress) — Login.jsx
- Persona toggle Driver / Broker — JWT login + Launch Cockpit lime CTA
- Driver Command dashboard — HOS KPIs, 3D HUD map (Carto Dark Matter w/ glowing polyline + HUD brackets), active load, predictive health alerts, ELD log grid, comms
- Split GPS / ELD cockpit (/driver/gps)
- ELD 24-hour log book (/driver/logs)
- Detention timer w/ Mongo-persisted entries (/driver/detention)
- Bill / BOL scanner — GPT-4o vision OCR (/driver/scan)
- Drivewyze-style weigh-station bypass cards (/driver/weigh)
- JADE voice co-pilot — Claude Sonnet 4.5 chat + browser STT/TTS + 5 suggestion chips (/driver/jade)
- Safety scorecard (radial + 7-day trend + categories) (/driver/safety)
- Load board (/driver/loads)
- Comms hub (/driver/messages)

### Broker side
- Broker Command Center — 5 KPIs + 14-day revenue + top lanes + live shipments (/broker)
- Quote Optimizer (JADE AI lane pricing) (/broker/quote)
- Carrier Risk table (/broker/carriers)
- Exception Queue w/ AI suggestions (/broker/exceptions)

### Shared
- 5 mood themes via `data-theme` (Jade, Midnight, Sunset, Storm, Aurora) — /settings
- Sidebar nav w/ JadeMark branding
- New "Jade Haul" brand identity: lime J tile + JADE HAUL wordmark + "A JadeOS Product · MPLS" subtitle
- Lime btn CTAs (#D4FF00) matching JadeOS marketing site

## Mocked / future integration points (clearly flagged)
- Real Drivewyze weigh-station feed — backend returns demo data, frontend ready for live stream
- Facial-recognition — webcam captured but biometric match is simulated (3.5s scan)
- 3D map — react-leaflet w/ dark tile (HUD style) acts as 3D-feeling map; swap to MapboxGL or Cesium for true 3D
- OpenAI Whisper STT + OpenAI TTS — currently browser WebSpeech; backend endpoints can route to OpenAI direct
- Live ELD hardware (vehicle bus) — demo HOS data; FMCSA cert work needed for production
- DOT audit sync — out of scope for v1

## Backlog (priority)
**P0** — none, all critical flows green (21/21 backend, 100% frontend)
**P1**
- Live Drivewyze API integration once partner cert obtained
- OpenAI Whisper STT + TTS server-side path with audio file uploads
- Real-time websocket for dispatcher → driver messaging
- Multi-driver/multi-broker tenancy (currently single demo creds per role)
**P2**
- Shipper visibility portal (public tracking link)
- Quickbooks/Stripe settlement integration
- Predictive maintenance ML upgrade (real telemetry)
- Mobile native shell (Capacitor) for true in-cab tablet deployment

## Test credentials
- Driver: `driver@jadeos.com` / `jade123`
- Broker: `broker@jadeos.com` / `jade123`

## Test history
- Iteration 1 (Feb 8 2026) — Backend 21/21 pass; Frontend caught P0 Leaflet/StrictMode double-init bug.
- Iteration 2 (Feb 8 2026) — Frontend 100% pass, all 16 flows green, 0 console errors, broker flow confirmed.
