# backend/test_nlp.py
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from services.nlp_services import analyze

tests = [
    "How do I connect to the office WiFi?",
    "My VPN keeps disconnecting, error code 0x800704C9, Windows 11",
    "My keyboard is not working, tried unplugging and replugging",
    "Laptop screen is cracked and completely dead",
    "Ransomware detected on the finance server, entire company affected",
    "I forgot my password and cannot login",
]

for text in tests:
    print(f"\nInput: {text[:60]}")
    print("-" * 50)
    r = analyze(text)
    print(f"category  : {r.category}")
    print(f"priority  : {r.priority}")
    print(f"severity  : {r.severity}")
    print(f"tier      : {r.tier}")
    print(f"sentiment : {r.sentiment_score}")
    print(f"urgency   : {r.urgency_score}")
    print(f"entities  : {r.entities}")
    print(f"keywords  : {r.keywords}")
    print(f"summary   : {r.summary}")
    print(f"simple?   : {r.is_simple_question}")