# backend/services/nlp_service.py
#
# WHAT THIS FILE DOES:
# Runs on EVERY input before anything else.
# Extracts structured understanding from raw text.
# Output drives the entire triage and pipeline decision.
#
# Three tools working together:
#   VADER   — fast sentiment + urgency scoring (rule-based, no GPU needed)
#   spaCy   — named entity recognition (error codes, OS, app names)
#   BERT    — category + priority classification (transformer model)
#
# Why this order?
#   VADER and spaCy are instant (< 50ms)
#   BERT is slower (200ms) but gives accurate classification
#   We run VADER + spaCy first to get quick signals,
#   then BERT only if keyword matching is uncertain

import re
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# KNOWN IT TERMS — spaCy wrongly tags these
# as PERSON or ORG — we filter them out
# ─────────────────────────────────────────
SPACY_FILTER_WORDS = {
    "wifi", "vpn", "ransomware", "malware", "phishing",
    "bluetooth", "hdmi", "usb", "cpu", "ram", "gpu",
    "dns", "dhcp", "ip", "tcp", "http", "https",
    "windows", "linux", "macos", "android", "ios",
    "microsoft", "google", "apple", "cisco", "oracle",
    "outlook", "teams", "zoom", "slack", "chrome",
    "firefox", "adobe", "sap", "excel", "word", "office",
}


# ─────────────────────────────────────────
# LAZY LOADING — models load once on first use
# not at import time — keeps server startup fast
# ─────────────────────────────────────────
_vader           = None
_spacy           = None
_bert_classifier = None


def _get_vader():
    global _vader
    if _vader is None:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        _vader = SentimentIntensityAnalyzer()
        logger.info("[NLP] VADER loaded")
    return _vader


def _get_spacy():
    global _spacy
    if _spacy is None:
        import spacy
        _spacy = spacy.load("en_core_web_sm")
        logger.info("[NLP] spaCy loaded")
    return _spacy


def _get_bert():
    """
    Zero-shot classifier using BERT.
    Zero-shot means we don't need to train it —
    we give it candidate labels and it scores each one.
    No labeled IT helpdesk data needed.
    """
    global _bert_classifier
    if _bert_classifier is None:
        from transformers import pipeline
        _bert_classifier = pipeline(
            "zero-shot-classification",
            model="facebook/bart-large-mnli",
        )
        logger.info("[NLP] BERT zero-shot classifier loaded")
    return _bert_classifier


# ─────────────────────────────────────────
# OUTPUT DATACLASS
# ─────────────────────────────────────────
@dataclass
class NLPResult:
    """
    Complete structured understanding of a ticket/message.
    Everything downstream reads from this — triage, RAG, LLM prompt.
    """
    # What type of problem
    category:             str

    # How urgent
    priority:             str             # P1, P2, P3, P4

    # How complex to solve
    severity:             str             # critical, high, medium, easy

    # Which pipeline path
    tier:                 str             # tier1, tier2, tier3a, tier3b, tier3c

    # Sentiment analysis (VADER)
    sentiment_score:      float           # -1 to 1
    urgency_score:        float           # 0 to 1

    # Named entities (spaCy + regex)
    entities:             dict  = field(default_factory=dict)

    # Keywords extracted
    keywords:             list  = field(default_factory=list)

    # Crisp 20-word summary for LLM prompt
    summary:              str   = ""

    # Simple question flag
    is_simple_question:   bool  = False

    # Raw confidence scores
    category_confidence:  float = 0.0
    priority_confidence:  float = 0.0


# ─────────────────────────────────────────
# KEYWORD RULES
# ─────────────────────────────────────────
CATEGORY_KEYWORDS = {
    "hardware": [
        "laptop", "keyboard", "mouse", "monitor", "screen", "printer",
        "charger", "battery", "usb", "hdmi", "cable", "headset",
        "webcam", "speaker", "microphone", "hard drive", "ram",
        "cracked", "broken", "damaged", "not turning on", "overheating",
        "touchpad", "trackpad", "docking station", "projector",
    ],
    "network": [
        "vpn", "wifi", "internet", "network", "ethernet", "connection",
        "ping", "dns", "ip address", "firewall", "proxy", "bandwidth",
        "disconnecting", "no internet", "slow connection", "timeout",
        "router", "switch", "port", "gateway", "packet loss",
    ],
    "auth": [
        "password", "login", "logout", "access denied", "locked out",
        "two factor", "2fa", "mfa", "sso", "active directory", "ldap",
        "permission", "unauthorized", "credential", "token expired",
        "forgot password", "reset password", "account locked",
    ],
    "software": [
        "install", "update", "upgrade", "crash", "error", "bug",
        "not responding", "freezing", "slow", "uninstall", "license",
        "microsoft", "office", "excel", "word", "outlook", "teams",
        "zoom", "slack", "chrome", "firefox", "adobe", "sap",
        "application", "app", "software", "program", "executable",
    ],
    "security": [
        "virus", "malware", "ransomware", "phishing", "hacked",
        "breach", "suspicious", "infected", "spam", "data leak",
        "unauthorized access", "stolen", "compromised", "threat",
        "firewall blocked", "intrusion", "suspicious email",
    ],
    "database": [
        "database", "sql", "query", "connection string", "db error",
        "postgresql", "mysql", "oracle", "mongodb", "backup", "restore",
        "data corruption", "table", "migration", "deadlock", "timeout",
    ],
    "cloud_app": [
        "azure", "aws", "gcp", "cloud", "sharepoint", "onedrive",
        "google drive", "dropbox", "salesforce", "jira", "confluence",
        "servicenow", "workday", "s3", "bucket", "subscription",
    ],
    "hr_it": [
        "onboarding", "offboarding", "new employee", "laptop request",
        "access request", "provisioning", "account creation",
        "employee leaving", "transfer", "department change",
        "new joiner", "exit", "new hire",
    ],
}

SEVERITY_KEYWORDS = {
    "critical": [
        "ransomware", "virus", "breach", "hacked", "data loss",
        "server down", "entire office", "everyone affected",
        "whole company", "production down", "outage", "emergency",
        "all users", "cracked screen", "burnt", "smoking",
        "physically damaged", "completely dead", "data corrupted",
        "cannot access anything", "total failure",
    ],
    "high": [
        "broken", "damaged", "not turning on", "team cannot",
        "several users", "department affected", "network down",
        "internet down", "cannot work", "completely blocked",
        "urgent", "asap", "immediately", "critical issue",
        "multiple users", "whole team",
    ],
    "medium": [
        "error code", "keeps crashing", "not responding",
        "cannot login", "access denied", "keeps disconnecting",
        "very slow", "freezing", "timeout", "corrupted file",
        "permission denied", "sync issue", "intermittent",
        "sometimes fails", "occasional",
    ],
    "easy": [
        "how do i", "how to", "where is", "what is",
        "forgot password", "reset password", "connect to wifi",
        "install software", "not connecting", "no sound",
        "brightness", "bluetooth", "simple question",
        "quick question", "just wanted to know",
        "unplugging", "restart", "reboot", "plug",
    ],
}
PRIORITY_SIGNALS = {
    "P1": [
        "entire office", "all users", "everyone", "whole company",
        "production down", "server down", "outage", "emergency",
        "ransomware", "breach", "data loss", "company wide",
        "all employees", "critical failure", "total outage",
    ],
    "P2": [
        "team cannot", "department affected", "several users",
        "multiple users", "whole team", "urgent", "asap",
        "immediately", "cannot work at all", "deadline today",
        "completely blocked", "multiple people",          # ← only strong signals
        # REMOVED: "error code", "cannot login", "locked out",
        # "keeps disconnecting", "access denied", "cannot connect"
        # these are P3 — single user affected
    ],
    "P3": [
        "my laptop", "my computer", "i cannot", "not working",
        "error", "issue", "problem", "help me", "forgot",
        "slow", "freezing", "my device", "cannot login",   # ← moved here
        "locked out", "error code", "access denied",       # ← moved here
        "keeps disconnecting", "cannot connect",           # ← moved here
    ],
    "P4": [
        "when you get a chance", "not urgent", "minor",
        "low priority", "whenever", "small issue",
        "no rush", "whenever possible",
    ],
}

SIMPLE_QUESTION_PATTERNS = [
    r"^how (do|can|should) i",
    r"^where (is|can i find|do i)",
    r"^what (is|are) the",
    r"^can (you|i)",
    r"^(how to|steps to|guide for)",
    r"^(what|where|when|who|which)\b",
]


# ─────────────────────────────────────────
# STEP 1 — VADER SENTIMENT + URGENCY
# ─────────────────────────────────────────
def analyze_sentiment(text: str) -> tuple:
    """
    Returns (sentiment_score, urgency_score)

    VADER gives:
      compound: -1 to 1  (overall sentiment)
      neg:       0 to 1  (negativity intensity)

    Urgency = combination of negativity + punctuation + caps
    """
    vader = _get_vader()
    scores = vader.polarity_scores(text)

    sentiment = round(scores["compound"], 3)

    urgency_base = scores["neg"]

    # exclamation marks signal urgency
    exclamation_count = text.count("!")
    urgency_base = min(1.0, urgency_base + exclamation_count * 0.1)

    # caps words signal emphasis
    if len(text) > 10:
        caps_ratio = sum(1 for c in text if c.isupper()) / len(text)
        urgency_base = min(1.0, urgency_base + caps_ratio * 0.3)

    urgency = round(urgency_base, 3)
    return sentiment, urgency


# ─────────────────────────────────────────
# STEP 2 — spaCy ENTITY EXTRACTION
# ─────────────────────────────────────────
def extract_entities(text: str) -> dict:
    """
    Extract named entities + custom IT patterns.
    Filters out known IT terms that spaCy mislabels.
    """
    nlp = _get_spacy()
    doc = nlp(text)
    entities = {}

    # spaCy entities — filtered
    for ent in doc.ents:
        if ent.text.lower() in SPACY_FILTER_WORDS:
            continue
        if ent.label_ in ("ORG", "PRODUCT", "GPE"):
            key = ent.label_.lower()
            if key not in entities:
                entities[key] = []
            if ent.text not in entities[key]:
                entities[key].append(ent.text)

    # Error codes: 0x800704C9, ERR-404, ERROR_502
    error_codes = re.findall(
        r'\b(0x[0-9A-Fa-f]+|[A-Z]{2,}[-_][0-9]{3,}|error\s*\d+)\b',
        text, re.IGNORECASE
    )
    if error_codes:
        entities["error_code"] = list(set(error_codes))

    # IP addresses — stored but sanitizer removes before Tavily
    ips = re.findall(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', text)
    if ips:
        entities["ip_address"] = ips

    # OS / version numbers
    versions = re.findall(
        r'\b(windows\s*\d+|mac\s*os|ubuntu\s*\d+|v\d+\.\d+|version\s*\d+)\b',
        text, re.IGNORECASE
    )
    if versions:
        entities["version"] = list(set(versions))

    # Port numbers
    ports = re.findall(r'\bport\s*(\d{2,5})\b', text, re.IGNORECASE)
    if ports:
        entities["port"] = ports

    return entities


# ─────────────────────────────────────────
# STEP 3 — KEYWORD MATCHING
# ─────────────────────────────────────────
def extract_keywords(text: str) -> list:
    """
    Extract IT keywords using word boundary matching.
    \b prevents "word" matching inside "password".
    """
    text_lower = text.lower()
    found = []
    for category_keywords in CATEGORY_KEYWORDS.values():
        for kw in category_keywords:
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, text_lower) and kw not in found:
                found.append(kw)
    return found


def detect_category_from_keywords(text: str) -> Optional[tuple]:
    """
    Quick category detection from keyword matching.
    Returns (category, confidence) or None.
    """
    text_lower = text.lower()
    scores = {}
    for category, kws in CATEGORY_KEYWORDS.items():
        matches = sum(
            1 for kw in kws
            if re.search(r'\b' + re.escape(kw) + r'\b', text_lower)
        )
        if matches > 0:
            scores[category] = matches

    if not scores:
        return None

    best = max(scores, key=scores.get)
    confidence = min(0.95, scores[best] / len(CATEGORY_KEYWORDS[best]) * 10)
    return best, round(confidence, 2)


def detect_severity_from_keywords(text: str) -> str:
    """
    Check most severe first — stops at first match.
    Returns: critical | high | medium | easy
    """
    text_lower = text.lower()
    for severity in ["critical", "high", "medium", "easy"]:
        for kw in SEVERITY_KEYWORDS[severity]:
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, text_lower):
                return severity
    return "medium"


def detect_priority_from_keywords(text: str) -> str:
    """
    Check highest priority first — stops at first match.
    Returns: P1 | P2 | P3 | P4
    """
    text_lower = text.lower()
    for priority in ["P1", "P2", "P3", "P4"]:
        for signal in PRIORITY_SIGNALS[priority]:
            pattern = r'\b' + re.escape(signal) + r'\b'
            if re.search(pattern, text_lower):
                return priority
    return "P3"


def is_simple_question(text: str) -> bool:
    """
    Returns True if message is a simple how-to / where-is question.
    These go to Tier 1 — LLM only.
    Guards: not simple if contains error code or urgency words.
    """
    text_lower = text.lower().strip()

    # Guard — error code present → not simple
    if re.search(r'0x[0-9A-Fa-f]+|error\s*\d+', text_lower):
        return False

    # Guard — urgency words → not simple

    not_simple_words = [
        "urgent", "asap", "down", "crash", "breach",
        "ransomware", "outage", "emergency", "blocked",
        "dead", "cracked", "broken", "damaged",        # ← ADD these
        "completely", "totally", "entirely",            # ← ADD these
    ]
    if any(w in text_lower for w in not_simple_words):
        return False

    # Short message under 8 words
    if len(text_lower.split()) <= 8:
        return True

    # Pattern matching
    for pattern in SIMPLE_QUESTION_PATTERNS:
        if re.search(pattern, text_lower):
            return True

    return False
    


# ─────────────────────────────────────────
# STEP 4 — BERT ZERO-SHOT CLASSIFICATION
# Only when keyword confidence < 0.4
# ─────────────────────────────────────────
def classify_with_bert(text: str) -> tuple:
    """
    BERT zero-shot classification for category.
    Slower (200ms) — only called when keywords are insufficient.
    Returns (category, confidence)
    """
    classifier = _get_bert()

    candidate_labels = [
        "network and VPN issue",
        "login and authentication problem",
        "hardware and device issue",
        "software and application error",
        "security incident",
        "database issue",
        "cloud application problem",
        "HR and IT onboarding request",
        "general IT question",
    ]

    label_map = {
        "network and VPN issue":            "network",
        "login and authentication problem": "auth",
        "hardware and device issue":        "hardware",
        "software and application error":   "software",
        "security incident":                "security",
        "database issue":                   "database",
        "cloud application problem":        "cloud_app",
        "HR and IT onboarding request":     "hr_it",
        "general IT question":              "other",
    }

    result     = classifier(text[:512], candidate_labels)
    top_label  = result["labels"][0]
    confidence = result["scores"][0]
    category   = label_map.get(top_label, "other")

    return category, round(confidence, 3)


# ─────────────────────────────────────────
# STEP 5 — SUMMARY GENERATION
# ─────────────────────────────────────────
def generate_summary(
    text: str,
    category: str,
    priority: str,
    severity: str,
    entities: dict
) -> str:
    """
    Crisp summary for LLM prompt.
    Format: [P2][MEDIUM] network issue. Error: 0x800704C9. VPN disconnecting on Windows 11
    No duplication — entity only added if not already in sentence.
    """
    # First sentence or first 100 chars
    first_sentence = text.split(".")[0].strip()
    if len(first_sentence) > 100:
        first_sentence = text[:100].rsplit(" ", 1)[0] + "..."

    # Entity parts — only if not already in first sentence
    entity_parts = []
    if "error_code" in entities:
        code = entities["error_code"][0]
        if code.lower() not in first_sentence.lower():
            entity_parts.append(f"Error: {code}")
    if "version" in entities:
        ver = entities["version"][0]
        if ver.lower() not in first_sentence.lower():
            entity_parts.append(ver)

    entity_str = " | ".join(entity_parts)

    summary = f"[{priority}][{severity.upper()}] {category} issue. "
    if entity_str:
        summary += f"{entity_str}. "
    summary += first_sentence[:80]

    return summary.strip()


# ─────────────────────────────────────────
# STEP 6 — TRIAGE DECISION
# ────────────────────────────────────────
def decide_tier(
    category: str,
    priority: str,
    severity: str,
    keywords: list,
    is_simple: bool
) -> str:

    # Tier 3C — P1 ONLY or security category
    # P2 does NOT automatically mean tier3c
    if priority == "P1":
        return "tier3c"
    if category == "security":
        return "tier3c"

    # Tier 3B — complex hardware
    if category == "hardware" and severity in ["high", "critical"]:
        return "tier3b"

    # Tier 3A — simple hardware
    if category == "hardware" and severity in ["easy", "medium"]:
        return "tier3a"

    # Tier 1 — simple question OR easy severity
    if is_simple or severity == "easy":
        return "tier1"

    # Tier 2 — everything else including P2 technical issues
    return "tier2"


# ─────────────────────────────────────────
# MAIN — analyze()
# ─────────────────────────────────────────
def analyze(text: str) -> NLPResult:
    """
    Full NLP analysis pipeline.
    Call this from ai_pipeline.py — runs on every input.

    Steps:
    1. VADER  → sentiment + urgency         (instant)
    2. spaCy  → entity extraction           (instant)
    3. Keywords → category, severity,       (instant)
                  priority, simple flag
    4. BERT   → category only if            (200ms — skipped when not needed)
                keyword confidence < 0.4
    5. Summary → crisp 20-word version      (instant)
    6. Triage  → which tier                 (instant)
    """
    logger.info(f"[NLP] Analyzing: {text[:60]}...")

    # Step 1
    sentiment, urgency = analyze_sentiment(text)

    # Step 2
    entities = extract_entities(text)

    # Step 3
    keywords = extract_keywords(text)
    severity = detect_severity_from_keywords(text)
    priority = detect_priority_from_keywords(text)
    simple   = is_simple_question(text)

    # Step 3b — category from keywords
    keyword_result = detect_category_from_keywords(text)

    # Step 4 — BERT only if keywords uncertain
    if keyword_result and keyword_result[1] >= 0.4:
        category       = keyword_result[0]
        cat_confidence = keyword_result[1]
        logger.debug(f"[NLP] Category from keywords: {category} ({cat_confidence})")
    else:
        logger.debug("[NLP] Keyword confidence low — running BERT")
        category, cat_confidence = classify_with_bert(text)
        logger.debug(f"[NLP] Category from BERT: {category} ({cat_confidence})")

    # Step 5
    summary = generate_summary(text, category, priority, severity, entities)

    # Step 6
    tier = decide_tier(category, priority, severity, keywords, simple)

    logger.info(
        f"[NLP] Result — category={category}, priority={priority}, "
        f"severity={severity}, tier={tier}"
    )

    return NLPResult(
        category             = category,
        priority             = priority,
        severity             = severity,
        tier                 = tier,
        sentiment_score      = sentiment,
        urgency_score        = urgency,
        entities             = entities,
        keywords             = keywords,
        summary              = summary,
        is_simple_question   = simple,
        category_confidence  = cat_confidence,
        priority_confidence  = 0.9,
    )