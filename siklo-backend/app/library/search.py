"""
Small built-in health library + keyword search (demo version of library.db).

Passages are ORIGINAL team-written summaries (not copied text), kept short and
conservative. Before launch: have a healthcare professional review them and move
them into library.db with status='reviewed' as the backend plan describes.
"""
import math
import re
from pathlib import Path

ARTICLES_DIR = Path(__file__).parent / "articles"

SOURCE_NOTE = "Pu-shy health library (team-written summary; pending medical review)"

PASSAGES = [
    {
        "id": "why-periods",
        "title": "Why periods happen",
        "keywords": (
            "menstruation menstruate menstrual period periods why happen happens cause reason bleed bleeding "
            "monthly uterus lining regla mens dalaw meron"
        ),
        "text": (
            "Each month, hormones prepare the lining of the uterus to support a possible pregnancy. "
            "If pregnancy doesn't happen, hormone levels drop and the uterus sheds that lining. "
            "The lining leaves the body through the vagina as menstrual blood, which is the period. "
            "This usually lasts a few days and then the cycle starts again."
        ),
    },
    {
        "id": "cramps",
        "title": "Period cramps",
        "keywords": (
            "cramp cramps cramping pain painful dysmenorrhea puson sakit masakit tummy belly stomach "
            "lower abdomen hurts hurt ache period menstrual menstruation regla mens dalaw"
        ),
        "text": (
            "Period cramps are a common dull or throbbing pain in the lower belly, often starting just before "
            "or at the start of a period and easing after 1 to 3 days. They happen because the uterus tightens "
            "to shed its lining. Warmth on the lower belly, gentle movement or stretching, rest, and staying "
            "hydrated can help. See a healthcare professional if the pain is severe, keeps you from daily "
            "activities, gets worse over time, or comes with fever or fainting."
        ),
    },
    {
        "id": "cycle-length",
        "title": "What is a normal cycle?",
        "keywords": "cycle cycles length normal days how long regular count period periods every month interval menstrual regla",
        "text": (
            "A menstrual cycle is counted from the first day of one period to the first day of the next. "
            "For adults, cycles commonly range from about 21 to 35 days, and periods usually last 2 to 7 days. "
            "In the first few years after periods start, cycles are often less regular. Small changes of a few "
            "days from month to month are common."
        ),
    },
    {
        "id": "irregular",
        "title": "Irregular periods",
        "keywords": "irregular late early missed skip skipped delayed delay change changed different unpredictable delayed regla",
        "text": (
            "Periods can be irregular for many reasons, including stress, illness, big changes in weight or "
            "exercise, travel, some medicines, and the first years after periods begin. Tracking your dates "
            "helps you notice patterns. If your periods are often very irregular, stop for three months or more, "
            "or you could be pregnant, a healthcare professional can help find the cause."
        ),
    },
    {
        "id": "heavy",
        "title": "Heavy bleeding: when to get help",
        "keywords": "heavy bleeding flow clots soak soaking pad tampon a lot much blood dizzy",
        "text": (
            "Bleeding is considered very heavy if you soak through a pad or tampon every hour for several hours, "
            "pass clots larger than a coin, or bleed longer than 7 days. Heavy bleeding can lead to low iron and "
            "tiredness. Please see a healthcare professional for heavy bleeding, and get urgent care if you feel "
            "faint, dizzy, or very weak."
        ),
    },
    {
        "id": "pms",
        "title": "PMS (premenstrual symptoms)",
        "keywords": "pms premenstrual moody irritable tender breasts craving cravings before period",
        "text": (
            "Many people notice changes in the days before a period, such as bloating, tender breasts, acne, "
            "food cravings, tiredness, or mood changes. These usually ease once the period starts. Regular sleep, "
            "movement, and regular meals can help. If symptoms are severe or affect relationships, school, or "
            "work, a healthcare professional can help."
        ),
    },
    {
        "id": "mood",
        "title": "Feelings and your cycle",
        "keywords": "feel feelings emotional cry crying anxious anxiety stress stressed angry tired low mood",
        "text": (
            "Hormone changes across the cycle can affect mood and energy for some people, especially in the days "
            "before a period. Noting how you feel in a journal can show whether your mood follows a pattern. "
            "If low mood lasts most days for two weeks or more, or you have thoughts of hurting yourself, please "
            "reach out to someone you trust or a mental health professional."
        ),
    },
    {
        "id": "phases",
        "title": "Phases of the cycle",
        "keywords": "phase phases follicular luteal menstrual hormones estrogen progesterone stage stages",
        "text": (
            "The cycle has a few broad phases: the period itself (menstrual phase), the follicular phase as the "
            "body prepares an egg, ovulation when an egg is released, and the luteal phase before the next period. "
            "Hormones such as estrogen and progesterone rise and fall across these phases, which is why energy, "
            "mood, and body symptoms can change during the month. Cycle tracking estimates are not a reliable "
            "form of birth control."
        ),
    },
    {
        "id": "hygiene",
        "title": "Period products and hygiene",
        "keywords": "pad pads tampon tampons change often hygiene napkin napkins products how often",
        "text": (
            "Pads, tampons, and menstrual cups are all common options. Change pads every 4 to 6 hours or sooner "
            "if needed, and change tampons at least every 4 to 8 hours, using the lowest absorbency that works "
            "for your flow. Follow the instructions that come with your product. Seek care quickly if you have a "
            "sudden high fever, rash, or feel very unwell while using a tampon."
        ),
    },
]

STOPWORDS = {
    "the", "a", "an", "and", "or", "is", "are", "my", "i", "me", "do", "does", "why", "what", "how",
    "when", "can", "to", "of", "in", "it", "for", "with", "get", "have", "be", "on", "at", "ko", "ang",
    "ng", "sa", "ba", "na", "po", "yung", "kasi", "pag", "lang",
}

MIN_SCORE = 2.0  # below this -> no verified source (tuned for the demo questions)


def _stem(word: str) -> str:
    """Very light stemming so 'bloated', 'bloating' and 'bloat' match."""
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower().replace("'", ""))
    return {_stem(w) for w in words if w not in STOPWORDS and len(w) > 2}


def load_article_files() -> list[dict]:
    """
    Read every .txt / .md file in app/library/articles. Format of each file:

        Title: Spotting between periods
        Keywords: spotting, brown discharge, light bleeding, patak
        ---
        The article text, in your own words...

    Files are re-read on every search, so new or edited articles work without a restart.
    """
    articles = []
    if not ARTICLES_DIR.is_dir():
        return articles
    for path in sorted(ARTICLES_DIR.glob("*")):
        if path.suffix.lower() not in {".txt", ".md"}:
            continue
        try:
            raw = path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError):
            continue
        header, sep, body = raw.partition("---")
        if not sep:
            continue
        title = re.search(r"^\s*title\s*:\s*(.+)$", header, flags=re.IGNORECASE | re.MULTILINE)
        keywords = re.search(r"^\s*keywords\s*:\s*(.+)$", header, flags=re.IGNORECASE | re.MULTILINE)
        text = " ".join(body.split())
        if not title or not text:
            continue
        articles.append({
            "id": path.stem,
            "title": title.group(1).strip(),
            "keywords": (keywords.group(1) if keywords else "").replace(",", " "),
            "text": text[:1500],  # keep prompts short so answers stay fast
        })
    return articles


def search(query: str, limit: int = 1) -> list[dict]:
    """Return the best-matching passages (each with title, text, source), or [] if nothing is relevant."""
    q = _tokens(query)
    passages = PASSAGES + load_article_files()
    prepared = [
        (p, _tokens(p["keywords"] + " " + p["title"]), _tokens(p["text"])) for p in passages
    ]

    # Words found in many articles (like "period") count less than specific ones (like "bloat").
    doc_freq: dict[str, int] = {}
    for _, keywords, text in prepared:
        for word in keywords | text:
            doc_freq[word] = doc_freq.get(word, 0) + 1
    total = max(len(prepared), 1)

    def weight(word: str) -> float:
        return math.log(1 + total / doc_freq.get(word, 1))

    scored = []
    for passage, keywords, text in prepared:
        score = 2 * sum(weight(w) for w in q & keywords) + 0.5 * sum(weight(w) for w in (q & text) - keywords)
        if score >= MIN_SCORE:
            scored.append((score, passage))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        {"id": p["id"], "title": p["title"], "text": p["text"], "source": SOURCE_NOTE}
        for _, p in scored[:limit]
    ]
