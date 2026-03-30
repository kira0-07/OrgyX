# import os
# import tempfile
# import logging
# from fastapi import FastAPI, UploadFile, File, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# import uvicorn

# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# app = FastAPI(title="Speaker Diarization Service")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# pipeline = None

# @app.on_event("startup")
# async def load_pipeline():
#     global pipeline
#     hf_token = os.environ.get("HF_TOKEN")
#     if not hf_token:
#         logger.error("HF_TOKEN not set — diarization will not work")
#         return
#     try:
#         from pyannote.audio import Pipeline
#         import torch
#         from huggingface_hub import login
#         login(token=hf_token)

#         logger.info("Loading pyannote speaker diarization pipeline...")

#         pipeline = Pipeline.from_pretrained(
#             "pyannote/speaker-diarization-3.1",
#             use_auth_token=hf_token
#         )

#         pipeline = pipeline.to(torch.device("cpu"))

#         # Set duration thresholds at init time — valid in pyannote 3.x
#         # min_duration_on=0.1 keeps any speech segment >= 100ms
#         # min_duration_off=0.1 splits speakers on silence gaps >= 100ms
#         # These cannot be passed at inference time in pyannote 3.x
#         try:
#             pipeline.segmentation.min_duration_on = 0.1
#             pipeline.segmentation.min_duration_off = 0.1
#             logger.info("Duration thresholds set: min_duration_on=0.1, min_duration_off=0.1")
#         except AttributeError:
#             logger.warning("Could not set duration thresholds — pipeline structure may differ")

#         logger.info("Pipeline loaded successfully on cpu")

#     except Exception as e:
#         logger.error(f"Failed to load pipeline: {e}")
#         import traceback
#         logger.error(traceback.format_exc())
#         pipeline = None


# @app.get("/health")
# def health():
#     return {
#         "status": "ok",
#         "pipeline_loaded": pipeline is not None
#     }


# @app.post("/diarize")
# async def diarize(
#     file: UploadFile = File(...),
#     num_speakers: int = None
# ):
#     if pipeline is None:
#         raise HTTPException(
#             status_code=503,
#             detail="Diarization pipeline not loaded. Check HF_TOKEN and logs."
#         )

#     suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
#     tmp_path = None

#     try:
#         with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
#             content = await file.read()
#             tmp.write(content)
#             tmp_path = tmp.name

#         logger.info(f"Diarizing {file.filename} ({len(content)/1024:.1f}KB), num_speakers={num_speakers}")

#         diarize_kwargs = {}
#         if num_speakers and num_speakers > 1:
#             diarize_kwargs["num_speakers"] = num_speakers

#         diarization = pipeline(tmp_path, **diarize_kwargs)

#         segments = []
#         speakers_seen = set()

#         for turn, _, speaker in diarization.itertracks(yield_label=True):
#             segments.append({
#                 "start": round(turn.start, 3),
#                 "end": round(turn.end, 3),
#                 "speaker": speaker
#             })
#             speakers_seen.add(speaker)

#         logger.info(f"Done: {len(segments)} segments, {len(speakers_seen)} speakers")

#         return {
#             "segments": segments,
#             "num_speakers_detected": len(speakers_seen)
#         }

#     except Exception as e:
#         logger.error(f"Diarization error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

#     finally:
#         if tmp_path and os.path.exists(tmp_path):
#             os.unlink(tmp_path)


# if __name__ == "__main__":
#     uvicorn.run(app, host="0.0.0.0", port=7860)


import os
import tempfile
import logging
import subprocess
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Speaker Diarization Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = None


# ─────────────────────────────────────────────────────────────
# Convert webm → wav (REQUIRED for pyannote)
# ─────────────────────────────────────────────────────────────
def convert_to_wav(input_path):
    output_path = input_path.replace(".webm", ".wav")

    try:
        subprocess.run([
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-ac", "1",        # mono
            "-ar", "16000",    # 16kHz (required)
            output_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        return output_path

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg conversion failed: {e}")
        raise Exception("Audio conversion failed (ffmpeg error)")


# ─────────────────────────────────────────────────────────────
# Load diarization pipeline
# ─────────────────────────────────────────────────────────────
@app.on_event("startup")
async def load_pipeline():
    global pipeline

    hf_token = os.environ.get("HF_TOKEN")
    logger.info(f"HF_TOKEN exists: {bool(hf_token)}")

    if not hf_token:
        logger.error("HF_TOKEN not set — diarization will not work")
        return

    try:
        from pyannote.audio import Pipeline
        import torch

        logger.info("Loading pyannote speaker diarization pipeline...")

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )

        pipeline = pipeline.to(torch.device("cpu"))

        logger.info("Pipeline loaded successfully on cpu")

    except Exception as e:
        logger.error(f"Failed to load pipeline: {e}")
        import traceback
        logger.error(traceback.format_exc())
        pipeline = None


# ─────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "pipeline_loaded": pipeline is not None
    }


# ─────────────────────────────────────────────────────────────
# Diarization endpoint
# ─────────────────────────────────────────────────────────────
@app.post("/diarize")
async def diarize(
    file: UploadFile = File(...),
    num_speakers: int = None
):
    if pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="Diarization pipeline not loaded. Check HF_TOKEN and logs."
        )

    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    tmp_path = None
    wav_path = None

    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        logger.info(
            f"Diarizing {file.filename} ({len(content)/1024:.1f}KB), "
            f"num_speakers={num_speakers}"
        )

        # ── Convert to WAV (CRITICAL FIX) ───────────────────────
        wav_path = convert_to_wav(tmp_path)

        diarize_kwargs = {}

        if num_speakers and num_speakers > 1:
            diarize_kwargs["num_speakers"] = num_speakers

        diarization = pipeline(wav_path, **diarize_kwargs)

        segments = []
        speakers_seen = set()

        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
                "speaker": speaker
            })
            speakers_seen.add(speaker)

        logger.info(f"Done: {len(segments)} segments, {len(speakers_seen)} speakers")

        return {
            "segments": segments,
            "num_speakers_detected": len(speakers_seen)
        }

    except Exception as e:
        logger.error(f"Diarization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup temp files
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)


# ─────────────────────────────────────────────────────────────
# Run server
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)