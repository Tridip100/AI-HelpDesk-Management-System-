# backend/services/vision_service.py
#
# Vision service — using minicpm-v
# Better OCR than llava on 4GB VRAM
# Specifically trained on screenshots and documents

import base64
import io
import logging
import httpx
from PIL import Image

from backend.config import settings

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL    = "minicpm-v"
TIMEOUT         = 90

VISION_PROMPT = (
    "This is a screenshot from a user reporting an IT support issue. "
    "Extract and quote ALL visible text EXACTLY as shown. "
    "Focus on: error messages, error codes (e.g. 0x..., Error XXXX), "
    "dialog box titles, application names, warning text, button labels. "
    "Quote every piece of text you can see. "
    "Do not describe the image layout or style — only extract the text content."
)


def resize_image(image_bytes: bytes, max_width: int = 800) -> bytes:
    """Resize before sending — faster inference, similar OCR accuracy."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.width > max_width:
            ratio = max_width / img.width
            img   = img.resize((max_width, int(img.height * ratio)))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"[VISION] Resize failed: {e}")
        return image_bytes


async def describe_image(image_bytes: bytes) -> str:
    """
    Send screenshot to minicpm-v, get back exact text extraction.
    Output feeds into normal qwen2.5 pipeline as plain text.
    """
    image_bytes = resize_image(image_bytes)
    b64_image   = base64.b64encode(image_bytes).decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":   VISION_MODEL,
                    "messages": [
                        {
                            "role":    "user",
                            "content": VISION_PROMPT,
                            "images":  [b64_image],
                        }
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 400,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()

        description = data["message"]["content"].strip()
        description = description.replace("```", "").strip()
        logger.info(f"[VISION] Described — {len(description)} chars")
        return description

    except httpx.ConnectError:
        logger.error("[VISION] Cannot connect to Ollama")
        return "[Could not analyze the image — vision service unavailable]"
    except httpx.TimeoutException:
        logger.error("[VISION] minicpm-v timed out")
        return "[Image analysis timed out]"
    except Exception as e:
        logger.error(f"[VISION] Failed: {e}")
        return "[Could not analyze the image]"