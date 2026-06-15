import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.vision_service import describe_image

async def main():
    path = input("Path to test image: ").strip()
    with open(path, "rb") as f:
        image_bytes = f.read()

    print(f"Image size: {len(image_bytes)} bytes")
    description = await describe_image(image_bytes)
    print("Description:")
    print(repr(description))

asyncio.run(main())