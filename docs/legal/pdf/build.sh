#!/usr/bin/env bash
# Builds the PDF edition of the legal documents from the Markdown in docs/legal/ — E22 S2.
#
# Needs pandoc and XeLaTeX (Romanian diacritics rule out pdflatex), plus the TeX Gyre fonts if
# the page is to look like the site; without them it falls back to DejaVu Serif and says so.
#
#   docs/legal/pdf/build.sh            # writes docs/legal/pdf/out/*.pdf
#   docs/legal/pdf/build.sh /tmp/pdf   # somewhere else
#
# On Debian/Ubuntu:
#   apt-get install pandoc texlive-xetex texlive-latex-recommended texlive-latex-extra \
#     texlive-fonts-recommended texlive-lang-european fonts-texgyre
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/out}"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for tool in pandoc xelatex python3; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done

# No `grep -q`: under pipefail its early exit makes fc-list report a broken pipe, and the test fails
# on a machine that has the fonts.
if fc-list 2>/dev/null | grep "TeX Gyre Pagella" >/dev/null; then
  mainfont="TeX Gyre Pagella"; sansfont="TeX Gyre Heros"; monofont="TeX Gyre Cursor"
else
  echo "TeX Gyre fonts not installed; falling back to DejaVu" >&2
  mainfont="DejaVu Serif"; sansfont="DejaVu Sans"; monofont="DejaVu Sans Mono"
fi

# Document → the short name in the running footer.
short_name() {
  case "$1" in
    termeni-si-conditii) echo "Termeni și condiții" ;;
    politica-de-confidentialitate) echo "Politica de confidențialitate" ;;
    politica-de-cookies) echo "Politica de cookie-uri" ;;
  esac
}

for name in termeni-si-conditii politica-de-confidentialitate politica-de-cookies; do
  src="$here/../$name.md"
  # Version and date come from the first bold line: „**Versiunea 0.1 · ciornă din 7 septembrie 2026 …".
  version="$(grep -oE '\*\*Versiunea [0-9]+\.[0-9]+' "$src" | head -1 | sed 's/.*Versiunea //')"
  date="$(grep -oE 'din [0-9]+ [a-zăâîșț]+ [0-9]{4}' "$src" | head -1 | sed 's/^din //')"

  python3 "$here/placeholders.py" < "$src" > "$tmp/$name.md"
  {
    printf '\\newcommand{\\docshort}{%s}\n' "$(short_name "$name")"
    printf '\\newcommand{\\docversion}{%s}\n' "${version:-—}"
    printf '\\newcommand{\\docdate}{%s}\n' "${date:-—}"
  } > "$tmp/meta.tex"

  pandoc "$tmp/$name.md" -o "$out/$name.pdf" \
    --from markdown+bracketed_spans \
    --pdf-engine=xelatex \
    --shift-heading-level-by=-1 \
    --lua-filter="$here/filters.lua" \
    --include-in-header="$tmp/meta.tex" \
    --include-in-header="$here/legal.tex" \
    -V lang=ro -V papersize=a4 -V fontsize=11pt -V "geometry:margin=24mm" \
    -V linestretch=1.15 -V colorlinks=true \
    -V "mainfont=$mainfont" -V "sansfont=$sansfont" -V "monofont=$monofont" \
    -V "monofontoptions=Scale=MatchLowercase" \
    -M "author=IT Bridge School" -M "date=${date:-}"
  echo "wrote $out/$name.pdf"
done

# The fill-in form: one field per [[placeholder]] still open in the three documents, generated from
# the same files, so it can never list a question the text no longer asks.
version="$(grep -oE '\*\*Versiunea [0-9]+\.[0-9]+' "$here/../termeni-si-conditii.md" | head -1 | sed 's/.*Versiunea //')"
date="$(grep -oE 'din [0-9]+ [a-zăâîșț]+ [0-9]{4}' "$here/../termeni-si-conditii.md" | head -1 | sed 's/^din //')"
python3 "$here/questionnaire.py" --legal "$here/legal.tex" --mainfont "$mainfont" \
  --version "${version:-—}" --date "${date:-—}" \
  "$here/../termeni-si-conditii.md" "$here/../politica-de-confidentialitate.md" "$here/../politica-de-cookies.md" \
  > "$tmp/formular-completare.tex"
# Twice: the first pass writes the page count the footer reads.
for _ in 1 2; do
  (cd "$tmp" && xelatex -interaction=nonstopmode -halt-on-error formular-completare.tex > formular.log 2>&1) \
    || { tail -n 30 "$tmp/formular.log" >&2; exit 1; }
done
cp "$tmp/formular-completare.pdf" "$out/formular-completare.pdf"
echo "wrote $out/formular-completare.pdf"
