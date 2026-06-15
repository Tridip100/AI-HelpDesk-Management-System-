import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # add project root
from backend.services import ai_pipeline

async def main():
    tests = [
        "How do I connect to office WiFi?",
        "My VPN keeps disconnecting, error code 0x800704C9, Windows 11",
        "My keyboard is not working, tried unplugging",
    ]
    for t in tests:
        print("="*60)
        print(f"Input: {t}")
        try:
            async for event in ai_pipeline.run_streaming(t):
                if event["type"] == "status":
                    print(f"  [status] {event['stage']}: {event['label']}")
                elif event["type"] == "draft":
                    print(f"  [draft] confidence={event['confidence']}")
                    print(f"  draft text: {event['response'][:150]}")
                elif event["type"] == "result":
                    print(f"  [result] tier={event['tier']} confidence={event['confidence']} ticket={event['should_create_ticket']}")
                    print(f"  final: {event['response'][:200] if event['response'] else None}")
                    print(f"  rag_sources={event['rag_sources']} tavily_used={event['tavily_used']}")
        except Exception as e:
            print(f"ERROR: {e}")
        print()

asyncio.run(main())