import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from services.nlp_services import analyze
from services.sanitizer_service import build_safe_query, strip_pii
from services.tavily_service import search as tavily_search

# Test sanitizer
print("=" * 60)
print("TEST 1 — Sanitizer")
print("=" * 60)
nlp_result = analyze("My VPN error 0x800704C9 keeps disconnecting on Windows 11")
query = build_safe_query(nlp_result)
print(f"Safe query: '{query}'")

print()
print("=" * 60)
print("TEST 2 — PII strip safety net")
print("=" * 60)
dirty = "John's laptop SN-789456 at IP 192.168.1.5 error 0x800704C9"
print(f"Before: {dirty}")
print(f"After:  {strip_pii(dirty)}")

print()
print("=" * 60)
print("TEST 3 — Tavily search")
print("=" * 60)
result = tavily_search(query)
print(f"Found results: {result['found_results']}")
print(f"Sources: {result['sources']}")
print(f"\nContext:\n{result['context'][:400]}")