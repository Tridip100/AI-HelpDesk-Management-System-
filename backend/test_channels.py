# backend/test_channels.py

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from channels.channel_router import ingest

print("=" * 50)
print("TEST 1 — Chat channel")
print("=" * 50)

chat_payload = {
    "session_id": "test_session_001",
    "messages": [
        {"role": "user", "text": "My VPN keeps disconnecting"},
        {"role": "bot",  "text": "What OS are you on?"},
        {"role": "user", "text": "Windows 11, error 0x800704C9"}
    ]
}

result = ingest("chat", chat_payload, user_id=1)
print(f"source      : {result.source}")
print(f"subject     : {result.subject}")
print(f"intake_id   : {result.intake_id}")
print(f"timestamp   : {result.timestamp}")
print(f"metadata    : {result.metadata}")
print(f"raw_content :\n{result.raw_content}")

print()
print("=" * 50)
print("TEST 2 — Call channel (text only, no audio)")
print("=" * 50)

call_payload = {
    "call_id": "call_test_001",
    "transcript": "User: My printer is offline\nAgent: Which printer?\nUser: HP LaserJet 4th floor",
    "duration_seconds": 45,
    "transcript_confidence": 0.91
}

result2 = ingest("call", call_payload, user_id=1)
print(f"source      : {result2.source}")
print(f"subject     : {result2.subject}")
print(f"intake_id   : {result2.intake_id}")
print(f"metadata    : {result2.metadata}")
print(f"raw_content :\n{result2.raw_content}")

print()
print("=" * 50)
print("TEST 3 — Email channel (raw email string)")
print("=" * 50)

raw_email = """From: alice@company.com
To: helpdesk@company.com
Subject: Laptop screen flickering since morning
Message-ID: <test001@company.com>
Content-Type: text/plain

Hi team,

My Dell XPS 15 screen has been flickering since this morning.
It happens every 5 minutes approximately.
OS: Windows 11. No recent updates installed.

Please help.
Alice
"""

from channels.email_handler import parse_email
result3 = parse_email(raw_email, user_id=1)
print(f"source      : {result3.source}")
print(f"subject     : {result3.subject}")
print(f"intake_id   : {result3.intake_id}")
print(f"metadata    : {result3.metadata}")
print(f"raw_content :\n{result3.raw_content}")

print()
print("=" * 50)
print("TEST 4 — Unknown channel (should raise ValueError)")
print("=" * 50)

try:
    ingest("fax", {}, user_id=1)
    print("ERROR: should have raised ValueError")
except ValueError as e:
    print(f"Correctly raised ValueError: {e}")

print()
print("ALL TESTS DONE")