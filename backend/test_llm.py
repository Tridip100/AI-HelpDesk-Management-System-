# backend/test_llm.py
import sys, os, asyncio
sys.path.insert(0, os.path.dirname(__file__))

from services.llm_services import generate, check_ollama_health

async def main():
    print("=" * 50)
    print("TEST 1 — Ollama health check")
    print("=" * 50)
    ok = await check_ollama_health()
    print(f"Ollama healthy: {ok}")

    print()
    print("=" * 50)
    print("TEST 2 — Simple WiFi question (Tier 1)")
    print("=" * 50)
    result = await generate(
        nlp_summary="[P3][EASY] network issue. How do I connect to office WiFi?",
    )
    print(f"Response:   {result['response']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Tokens:     {result['tokens']}")

    print()
    print("=" * 50)
    print("TEST 3 — VPN error with context (Tier 2)")
    print("=" * 50)
    result2 = await generate(
        nlp_summary="[P3][MEDIUM] network issue. Error: 0x800704C9. VPN disconnecting on Windows 11",
        rag_context="Past fix: Change VPN keep-alive interval to 25 seconds in adapter settings. Resolved 8 similar tickets.",
    )
    print(f"Response:   {result2['response']}")
    print(f"Confidence: {result2['confidence']}")

    print()
    print("=" * 50)
    print("TEST 4 — Streaming test")
    print("=" * 50)
    from services.llm_services import generate_stream
    import json

    print("Streaming response:")
    print("-" * 30)

    async for token in generate_stream(
        nlp_summary="[P3][EASY] auth issue. Forgot password and cannot login.",
    ):
        # check if this token is the final confidence JSON
        # confidence message starts with { and contains "type"
        if token.startswith('{"type"'):
            try:
                data = json.loads(token)
                print(f"\n[Confidence: {data['value']}]")
            except json.JSONDecodeError:
                pass
        else:
            # regular token — print immediately without newline
            print(token, end="", flush=True)

    print()  # newline after streaming completes

asyncio.run(main())