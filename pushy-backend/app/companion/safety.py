"""
Safety pre-check (before the AI) and post-check (after the AI).
Keyword rules in English, Filipino and Taglish. Bias toward escalating:
a false alarm is acceptable, a miss is not. Have a native speaker review the lists.
"""
import re

# TODO before demo: verify each number against its official source.
HOTLINES = (
    "• NCMH Crisis Hotline: 1553 (toll-free) or 0917-899-8727\n"
    "• Hopeline PH: 0917-558-4673 or (02) 8804-4673\n"
    "• Emergency: 911"
)

SELF_HARM = [
    r"\bkill (my ?self|myself)\b", r"\bsuicid", r"\bwant to die\b", r"\bend (it all|my life)\b",
    r"\bself[- ]?harm", r"\bhurt(ing)? my ?self\b", r"\bno reason to live\b", r"\bbetter off dead\b",
    r"\bcut(ting)? my ?self\b",
    # Filipino / Taglish
    r"\bmagpakamatay\b", r"\bpatayin (ko )?(ang )?sarili\b", r"\bgusto ko (nang )?mamatay\b",
    r"\bayoko na(ng)? mabuhay\b", r"\bsaktan (ko )?(ang )?sarili\b", r"\bwala na(ng)? saysay\b",
    r"\bsana mamatay na\b", r"\bmamatay na lang\b",
]

EMERGENCY = [
    r"\bfaint(ed|ing)?\b", r"\bpassed out\b", r"\bcan'?t breathe\b", r"\bsoak(ing|ed)? .*every hour\b",
    r"\bsevere (bleeding|pain)\b", r"\bnahimatay\b", r"\bsobrang (sakit|dugo)\b",
]

PREGNANCY_PROBABILITY = [
    r"\bam i pregnant\b", r"\bcould i be pregnant\b", r"\bchance(s)? (of|that) .*pregnan",
    r"\bbuntis ba ako\b", r"\bbaka buntis\b", r"\bpregnant ba\b",
]

MISSED_PILL = [
    r"\bmissed (my |a )?pill", r"\bforgot (to take )?(my |the )?pill", r"\bnakalimutan.*pill",
]

OUT_OF_SCOPE = [
    r"\bsafe days?\b", r"\bdo i have pcos\b", r"\bdiagnos", r"\bhow (much|many) (mg|milligrams|tablets|pills) should\b",
    r"\bdosage\b", r"\bwhat dose\b", r"\bmay pcos ba ako\b",
]

FIXED_REPLIES = {
    "self_harm": (
        "I'm really glad you told me, and I'm sorry you're carrying this right now. You deserve support "
        "from a real person. Please reach out to someone you trust, or to one of these free, confidential lines:\n"
        f"{HOTLINES}\n"
        "If you're in immediate danger, call 911. I'm still here if you want to keep talking."
    ),
    "emergency": (
        "That sounds serious. Please get medical help now: go to the nearest clinic or emergency room, "
        "or call 911. If you can, ask someone nearby to stay with you."
    ),
    "pregnancy": (
        "I can't tell whether you're pregnant, and cycle tracking can't confirm or rule it out. A pregnancy "
        "test (best taken from the first day of a missed period) or a visit to a healthcare professional "
        "can give you a real answer."
    ),
    "missed_pill": (
        "What to do after a missed pill depends on your specific pill. Please check the leaflet that came "
        "with your pack, or ask a pharmacist or doctor. They can tell you exactly what to do."
    ),
    "out_of_scope": (
        "I can't diagnose conditions, recommend medicine doses, or tell you which days are 'safe'. "
        "A healthcare professional can help with that. I'm happy to explain how cycles work or help you "
        "notice patterns in what you've logged."
    ),
}


def _matches(patterns: list[str], text: str) -> bool:
    return any(re.search(p, text, flags=re.IGNORECASE) for p in patterns)


def pre_check(text: str) -> str | None:
    """Return a category key if a fixed reply must be used instead of the AI, else None. Self-harm first."""
    if _matches(SELF_HARM, text):
        return "self_harm"
    if _matches(EMERGENCY, text):
        return "emergency"
    if _matches(PREGNANCY_PROBABILITY, text):
        return "pregnancy"
    if _matches(MISSED_PILL, text):
        return "missed_pill"
    if _matches(OUT_OF_SCOPE, text):
        return "out_of_scope"
    return None


BLOCKED_OUTPUT = [
    r"\b\d+\s?(mg|milligrams)\b",          # medicine doses
    r"\byou (likely |probably |may )?have (pcos|endometriosis)\b",
    r"\bsafe days?\b",
    r"\b\d{1,3}\s?% (chance|likely|probability)\b",
    r"\bguarantee",
]

POST_CHECK_FALLBACK = (
    "I'm not able to give medical specifics like that. A healthcare professional or pharmacist can help. "
    "I can share general information about cycles if that's useful."
)


def post_check(reply: str) -> str:
    """Replace replies that drift into dosages, diagnoses, safe days, percentages or guarantees."""
    if _matches(BLOCKED_OUTPUT, reply) or _matches(SELF_HARM, reply):
        return POST_CHECK_FALLBACK
    return reply
