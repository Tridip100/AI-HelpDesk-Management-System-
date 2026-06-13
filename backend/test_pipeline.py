import sys, os, asyncio
sys.path.insert(0, os.path.dirname(__file__))
from services import ai_pipeline

async def main():
    tests = [
        "How do I connect to office WiFi?",
        "My VPN keeps disconnecting, error code 0x800704C9, Windows 11",
        "My keyboard is not working, tried unplugging",
        "Laptop screen is cracked and completely dead",
        "Ransomware detected on finance server, entire company affected",
    ]
    for t in tests:
        print("="*60)
        print(f"Input: {t}")
        try:
            r = await ai_pipeline.run(t)
            print(f"tier={r['tier']} confidence={r['confidence']} ticket={r['should_create_ticket']}")
            print(f"response: {r['response'][:200] if r['response'] else None}")
            print(f"rag_sources={r['rag_sources']} tavily_used={r['tavily_used']}")
        except Exception as e:
            print(f"ERROR: {e}")
        print()

asyncio.run(main())