import io
import base64
import logging
import httpx
from PIL import Image

from backend.config import settings

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL = "llava"
TIMEOUT = 120

VISION_PROMPT = (
    "You are analyzing a screenshot for IT support. "
    "Your ONLY job is to extract and quote the exact visible text. "
    "Focus on: error message text, error codes (e.g. 0x..., Error XXXX), "
    "dialog box titles, application names, warning text. "
    "Quote ALL visible text EXACTLY as it appears. "
    "Do not describe the image style or layout. "
    "Format: list each piece of text on a new line, quoted exactly."
)


def resize_image(image_bytes: bytes, max_width: int = 800) -> bytes:
    """
    Resize large screenshots before sending to the vision model —
    reduces processing time with minimal OCR accuracy loss for UI text.
    """
    img = Image.open(io.BytesIO(image_bytes))
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def describe_image(image_bytes: bytes) -> str:
    image_bytes = resize_image(image_bytes)
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": VISION_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": VISION_PROMPT,
                            "images": [b64_image],
                        }
                    ],
                    "stream": False,
                    "options": {"temperature": 0.2, "num_predict": 400},
                },
            )
            response.raise_for_status()
            data = response.json()

        description = description.replace("```", "").strip()
        logger.info(f"[VISION] Described image — {len(description)} chars")
        return description

    except httpx.ConnectError:
        logger.error("[VISION] Cannot connect to Ollama")
        return "[Could not analyze the image — vision service unavailable]"
    except httpx.TimeoutException:
        logger.error("[VISION] Vision model timed out")
        return "[Image analysis timed out]"
    except Exception as e:
        logger.error(f"[VISION] Failed: {e}")
        return "[Could not analyze the image]"