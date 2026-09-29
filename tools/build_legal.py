"""Build terms/ and privacy/ (Mongolian) and terms/en/ and privacy/en/ (English) from the
Markdown in legal/.

The Markdown is exported from the Claude doc "Kuul — Terms of Use & Privacy Policy (draft)",
its MN and EN tabs, into legal/*.mn.md and legal/*.en.md. When the doc changes, export those
tabs over them and run:

    python3 tools/build_legal.py   # from the site folder

Only the Markdown the doc uses is handled: # and ## headings, paragraphs, - and 1. lists,
pipe tables, **bold** and escaped brackets.
"""
import html
import re
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent

PAGES = [
    # (slug, source, nav label)
    ("terms", "legal/terms.{lang}.md", {"mn": "Үйлчилгээний нөхцөл", "en": "Terms of Use"}),
    ("privacy", "legal/privacy.{lang}.md", {"mn": "Нууцлалын бодлого", "en": "Privacy Policy"}),
]
# "Нийгэмлэгийн дүрэм" in the landing footer and the design's Legal nav is section 6 of the Terms.
COMMUNITY = ("terms", "s6", {"mn": "Нийгэмлэгийн дүрэм", "en": "Community rules"})
# Mongolian at /terms/, English at /terms/en/ (App Store Connect links the English one).
UI = {
    "mn": {"home": "Kuul — нүүр", "back": "← Нүүр хуудас", "docs": "Баримт бичгүүд", "other": "English", "other_lang": "en"},
    "en": {"home": "Kuul — home", "back": "← Home", "docs": "Documents", "other": "Монгол", "other_lang": "mn"},
}


def href(from_lang, slug, to_lang):
    up = "../" if from_lang == "mn" else "../../"
    return f"{up}{slug}/" + ("en/" if to_lang == "en" else "")


def inline(text):
    text = text.replace("\\[", "[").replace("\\]", "]")
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"\bhello@kuul\.mn\b", '<a href="mailto:hello@kuul.mn">hello@kuul.mn</a>', text)


def convert(md):
    """Markdown → (title, meta line, body HTML)."""
    lines = md.strip("\n").split("\n")
    assert lines[0].startswith("# "), "the doc starts with its title"
    title = lines[0][2:].strip()
    out, meta, i = [], None, 1
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.startswith("## "):
            head = line[3:].strip()
            num = re.match(r"(\d+)\.", head)
            anchor = f' id="s{num.group(1)}"' if num else ""
            out.append(f"<h2{anchor}>{inline(head)}</h2>")
            i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head, *body = rows
            th = "".join(f"<th>{inline(c)}</th>" for c in head)
            trs = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(f'<div class="table-wrap"><table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>')
        elif re.match(r"(- |\d+\. )", line):
            tag = "ul" if line.startswith("- ") else "ol"
            items = []
            while i < len(lines) and re.match(r"(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i]))
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(t)}</li>" for t in items) + f"</{tag}>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#|\||- |\d+\. )", lines[i]):
                para.append(lines[i].strip())
                i += 1
            text = " ".join(para)
            if meta is None and not out:
                meta = text  # "Төсөл 1.0 · Хүчин төгөлдөр болох огноо [ ] · ..." right under the title
            else:
                out.append(f"<p>{inline(text)}</p>")
    return title, meta, "\n".join(out)


def page(slug, lang, title, meta, body):
    # The current page's highlight is its own element so the page-switch transition can glide it
    # from one nav item to the other (legal.css, view-transition-name: legal-pill).
    current = ' aria-current="page"'
    pill = '<span class="legal-nav__pill" aria-hidden="true"></span>'
    ui, root = UI[lang], "../" if lang == "mn" else "../../"
    nav = "\n".join(f'<a href="{href(lang, s, lang)}"{current if s == slug else ""}>{pill if s == slug else ""}{label[lang]}</a>' for s, _, label in PAGES)
    nav += f'\n<a href="{href(lang, COMMUNITY[0], lang)}#{COMMUNITY[1]}">{COMMUNITY[2][lang]}</a>'
    nav += f'\n<a href="{href(lang, slug, ui["other_lang"])}" hreflang="{ui["other_lang"]}" lang="{ui["other_lang"]}">{ui["other"]}</a>'
    # The first two parts of the meta line (version, effective date) sit above the title as an overline.
    parts = (meta or "").split(" · ")
    overline, note = " · ".join(parts[:2]), " · ".join(parts[2:])
    note_html = f'\n<p class="lead">{inline(note)}</p>' if note else ""
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<link rel="icon" href="{root}assets/logo/app-icon-brand.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,0&icon_names=info&display=block">
<link rel="stylesheet" href="{root}css/colors.css">
<link rel="stylesheet" href="{root}css/typography.css">
<link rel="stylesheet" href="{root}css/spacing.css">
<link rel="stylesheet" href="{root}css/effects.css">
<link rel="stylesheet" href="{root}css/landing.css">
<link rel="stylesheet" href="{root}css/legal.css">
</head>
<body class="legal">
<!-- Generated by tools/build_legal.py from {dict((s, src) for s, src, _ in PAGES)[slug].format(lang=lang)}. Don't edit by hand. -->
<header class="legal-header">
  <div class="legal-header-inner">
    <a href="{root}" aria-label="{ui['home']}" class="nav-logo"><img src="{root}assets/logo/app-icon-brand.svg" alt="Kuul"></a>
    <a href="{root}" class="caps legal-back">{ui['back']}</a>
  </div>
</header>
<div class="legal-layout">
  <nav class="legal-nav" aria-label="{ui['docs']}">
    <span class="caps">Legal</span>
    {nav}
  </nav>
  <main class="legal-main">
    <article class="legal-doc">
      <span class="caps legal-meta">{inline(overline)}</span>
      <h1>{html.escape(title)}</h1>{note_html}
{body}
    </article>
  </main>
</div>
</body>
</html>
"""


for slug, src, _ in PAGES:
    for lang in UI:
        title, meta, body = convert((WEB / src.format(lang=lang)).read_text(encoding="utf-8"))
        dest = WEB / slug / ("en" if lang == "en" else "") / "index.html"
        dest.parent.mkdir(exist_ok=True)
        dest.write_text(page(slug, lang, title, meta, body), encoding="utf-8")
        print(f"{dest.relative_to(WEB)}: {title}")
