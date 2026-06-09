"""Text-to-Speech — OpenAI TTS (Nova voice) via Emergent LLM Key."""
from __future__ import annotations
import os
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

log = logging.getLogger("tts")
router = APIRouter(tags=["tts"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

ALLOWED_VOICES = {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"}
ALLOWED_MODELS = {"tts-1", "tts-1-hd"}


class TTSIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice: str = "nova"     # Jade's voice
    model: str = "tts-1"
    speed: float = 1.0


@router.get("/tts/health")
async def tts_health():
    return {"ok": bool(EMERGENT_LLM_KEY), "voices": sorted(ALLOWED_VOICES), "models": sorted(ALLOWED_MODELS)}


@router.post("/tts/speak")
async def tts_speak(payload: TTSIn):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "TTS unavailable — EMERGENT_LLM_KEY not configured")

    voice = payload.voice if payload.voice in ALLOWED_VOICES else "nova"
    model = payload.model if payload.model in ALLOWED_MODELS else "tts-1"
    speed = max(0.25, min(4.0, float(payload.speed or 1.0)))

    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await tts.generate_speech(
            text=payload.text, model=model, voice=voice, speed=speed,
        )
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        log.exception("tts failed")
        raise HTTPException(502, f"TTS failed: {e}")
