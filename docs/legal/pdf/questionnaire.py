#!/usr/bin/env python3
"""The fill-in form for everything the legal documents still leave open — E22 S2.

Scans the documents for [[…]] placeholders, sorts them by what each one asks for — a fact about the
company, a proposed number, a decision, a confirmation — and writes a LaTeX document with one form
field per question, so the answers can be typed straight into the PDF and sent back. It is
generated from the documents on every build: a placeholder added to the text is a question on the
form, and one removed is gone.

    questionnaire.py --legal legal.tex --mainfont "TeX Gyre Pagella" \\
        --version 0.1 --date "7 septembrie 2026" DOC.md... > formular.tex
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field

PLACEHOLDER = re.compile(r"\[\[(.+?)\]\]", re.DOTALL)
HEADING = re.compile(r"^(#{2,3})\s+(.+)$", re.MULTILINE)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
# A full stop that ends a legal citation is not the end of a sentence.
ABBREVIATIONS = ("art.", "alin.", "lit.", "nr.", "ex.", "S.R.L.", "vs.")
MARKUP = re.compile(r"\*\*|`")

SHORT_NAMES = {
    "termeni-si-conditii.md": "Termeni",
    "politica-de-confidentialitate.md": "Confidențialitate",
    "politica-de-cookies.md": "Cookie-uri",
}

KINDS = {
    "fact": "A. Fapte despre firmă și contact",
    "proposal": "B. Cifre propuse",
    "decision": "C. Decizii",
    "confirmation": "D. Confirmări",
    "note": "E. Note care se rezolvă în cod, nu aici",
}


@dataclass
class Question:
    kind: str
    text: str
    where: list[str] = field(default_factory=list)
    context: str = ""


def collapse(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def classify(text: str) -> str | None:
    if text == "…":
        return None
    if text.startswith("PROPUNERE"):
        return "proposal"
    if text.startswith("DE DECIS"):
        return "decision"
    if text.startswith("DE CONFIRMAT"):
        return "confirmation"
    first = text.split()[0].rstrip(",:")
    if first.isupper() or (" / " in text and len(text) < 60):
        return "fact"
    return "note"


def section_at(source: str, position: int) -> str:
    current = ""
    for match in HEADING.finditer(source):
        if match.start() > position:
            break
        current = collapse(match.group(2))
    return current


def context_at(source: str, start: int, end: int, marker: str) -> str:
    """The sentence (or the table row) around the placeholder, with the placeholder blanked."""
    line_start = source.rfind("\n", 0, start) + 1
    line_end = source.find("\n", end)
    line = source[line_start : line_end if line_end >= 0 else len(source)]
    stripped = line.lstrip()
    if stripped.startswith("|"):
        cells = [collapse(cell) for cell in line.strip().strip("|").split("|")]
        text = " · ".join(cell for cell in cells if cell)
    elif stripped.startswith("- "):
        text = collapse(stripped[2:])
    else:
        para_start = source.rfind("\n\n", 0, start) + 2
        para_end = source.find("\n\n", end)
        paragraph = collapse(source[para_start : para_end if para_end >= 0 else len(source)])
        for abbreviation in ABBREVIATIONS:
            paragraph = paragraph.replace(abbreviation + " ", abbreviation + "\u00a0")
        text = next((s for s in SENTENCE_END.split(paragraph) if marker in s), paragraph).replace("\u00a0", " ")
    text = MARKUP.sub("", text.replace(marker, "______"))
    # Another placeholder in the same sentence reads better as its text than as brackets.
    text = re.sub(r"\[\[(.+?)\]\]", r"\1", text)
    if text.strip("_ .") == "":
        return ""
    if len(text) > 300:
        cut = text.find("______")
        left = max(0, cut - 140)
        text = ("…" if left else "") + text[left : left + 300] + "…"
    return text


def scan(path: str) -> list[Question]:
    source = open(path, encoding="utf-8").read()
    name = path.rsplit("/", 1)[-1]
    short = SHORT_NAMES.get(name, name)
    questions: list[Question] = []
    for match in PLACEHOLDER.finditer(source):
        if match.start() > 0 and source[match.start() - 1] == "`":
            continue
        text = collapse(match.group(1))
        kind = classify(text)
        if kind is None:
            continue
        where = f"{short} · {section_at(source, match.start())}"
        marker = "[[" + text + "]]"
        # The collapsed paragraph collapses the placeholder the same way, so the marker matches.
        questions.append(Question(kind, text, [where], context_at(source, match.start(), match.end(), marker)))
    return questions


def merge_facts(questions: list[Question]) -> list[Question]:
    """One field per fact, however many times the documents ask for it."""
    merged: list[Question] = []
    by_text: dict[str, Question] = {}
    for question in questions:
        if question.kind != "fact":
            merged.append(question)
            continue
        if question.text in by_text:
            by_text[question.text].where.extend(question.where)
        else:
            by_text[question.text] = question
            merged.append(question)
    return merged


LATEX_SPECIALS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def tex(value: str) -> str:
    return "".join(LATEX_SPECIALS.get(char, char) for char in value)


def strip_prefix(text: str, prefix: str) -> str:
    rest = text[len(prefix) :] if text.startswith(prefix) else text
    return rest.lstrip(" :").strip()


FIELD = r"\TextField[name=%s,width=%s,height=%s,bordercolor={0.72 0.70 0.68},backgroundcolor={0.98 0.97 0.96},borderwidth=1%s]{}"
CHECK = r"\CheckBox[name=%s,width=0.95em,height=0.95em,bordercolor={0.72 0.70 0.68}]{}"


def text_field(name: str, lines: int = 1) -> str:
    if lines == 1:
        return FIELD % (name, r"\linewidth", "1.5em", "")
    return FIELD % (name, r"\linewidth", f"{1.35 * lines:.1f}em", ",multiline=true")


def render_question(index: int, q: Question) -> str:
    where = " · ".join(dict.fromkeys(q.where))
    lines = [r"\begin{question}", r"{\footnotesize\color{muted}" + tex(where) + r"\par}"]
    if q.kind == "fact":
        lines.append(r"{\bfseries " + tex(q.text) + r"\par}")
        lines.append(r"{\small\itshape " + tex(q.context) + r"\par}")
        lines.append(text_field(f"q{index}", 2 if len(q.text) > 30 else 1))
    elif q.kind == "proposal":
        if q.context:
            lines.append(r"{\small\itshape " + tex(q.context) + r"\par}")
        lines.append(r"Propunere: {\bfseries " + tex(strip_prefix(q.text, "PROPUNERE")) + r"}\par")
        lines.append(CHECK % f"q{index}ok" + r"~accept propunerea\quad altă valoare: " + FIELD % (f"q{index}", "7cm", "1.5em", ""))
    elif q.kind == "decision":
        if q.context:
            lines.append(r"{\small\itshape " + tex(q.context) + r"\par}")
        lines.append(r"De decis: {\bfseries " + tex(strip_prefix(q.text, "DE DECIS")) + r"}\par")
        lines.append(text_field(f"q{index}", 2))
    elif q.kind == "confirmation":
        if q.context:
            lines.append(r"{\small\itshape " + tex(q.context) + r"\par}")
        lines.append(r"De confirmat: {\bfseries " + tex(strip_prefix(q.text, "DE CONFIRMAT")) + r"}\par")
        lines.append(CHECK % f"q{index}ok" + r"~confirmat\quad observații: " + FIELD % (f"q{index}", "8.5cm", "1.5em", ""))
    else:
        lines.append(r"{\small " + tex(q.text) + r"\par}")
    lines.append(r"\end{question}")
    return "\n".join(lines)


def render(questions: list[Question], legal: str, mainfont: str, version: str, date: str) -> str:
    groups = {kind: [q for q in questions if q.kind == kind] for kind in KINDS}
    total = sum(len(v) for k, v in groups.items() if k != "note")
    out: list[str] = []
    out.append(r"""\documentclass[11pt,a4paper]{article}
\usepackage{fontspec}
\setmainfont{%s}[Ligatures=TeX]
\usepackage[romanian]{babel}
\usepackage[margin=24mm]{geometry}
\usepackage{longtable}
\usepackage[unicode,colorlinks]{hyperref}
\newcommand{\docshort}{Formular de completare}
\newcommand{\docversion}{%s}
\newcommand{\docdate}{%s}
\input{%s}
\newenvironment{question}{\par\vspace{10pt}\noindent\begin{minipage}{\linewidth}\setlength{\parskip}{3pt}}{\end{minipage}\par}
\title{Formular de completare pentru textele juridice}
\begin{document}
\maketitle
\begin{Form}
""" % (mainfont, tex(version), tex(date), legal))
    out.append(
        tex(
            f"Termenii și condițiile, politica de confidențialitate și politica de cookie-uri au {total} "
            "locuri pe care codul nu le poate completa: fapte despre firmă, cifre propuse, decizii ale școlii "
            "și confirmări. Formularul ăsta le adună pe toate, cu fraza în care apare fiecare. Se completează "
            "direct în PDF — Acrobat, Preview sau Chrome —, se salvează și se trimite înapoi; o propunere "
            "acceptată ca atare se bifează, restul se scrie în câmp. Răspunsurile intră apoi în texte, iar "
            "versiunea următoare a documentelor nu mai are niciun loc gol."
        )
        + r"\par"
    )
    index = 0
    for kind, title in KINDS.items():
        items = groups[kind]
        if not items:
            continue
        out.append(r"\section*{" + tex(title) + "}")
        if kind == "note":
            out.append(
                tex(
                    "Marcate în texte ca să nu se uite; se rezolvă când e livrată integrarea cu SmartBill "
                    "(E16 S2), nu printr-un răspuns aici."
                )
                + r"\par"
            )
        for q in items:
            index += 1
            out.append(render_question(index, q))
    out.append(r"""
\section*{Alte observații}
""" + text_field("final", 5) + r"""
\par\vspace{14pt}
Completat de: \TextField[name=by,width=6cm,height=1.5em,bordercolor={0.72 0.70 0.68},backgroundcolor={0.98 0.97 0.96},borderwidth=1]{}
\quad Data: \TextField[name=on,width=4cm,height=1.5em,bordercolor={0.72 0.70 0.68},backgroundcolor={0.98 0.97 0.96},borderwidth=1]{}
\end{Form}
\end{document}
""")
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legal", required=True, help="path to legal.tex")
    parser.add_argument("--mainfont", default="TeX Gyre Pagella")
    parser.add_argument("--version", default="—")
    parser.add_argument("--date", default="—")
    parser.add_argument("--list", action="store_true", help="print the questions instead of LaTeX")
    parser.add_argument("documents", nargs="+")
    args = parser.parse_args()

    questions = merge_facts([q for path in args.documents for q in scan(path)])
    if args.list:
        for q in questions:
            print(f"[{q.kind}] {q.text}\n    where: {' | '.join(dict.fromkeys(q.where))}\n    ctx: {q.context}")
        return
    sys.stdout.write(render(questions, args.legal, args.mainfont, args.version, args.date))


if __name__ == "__main__":
    main()
