"""Marks [[…]] placeholders as pandoc spans, so the PDF can print them loud.

`[[CUI]]` becomes `[CUI]{.placeholder}` — pandoc's bracketed_spans extension reads that as a Span
with a class, and filters.lua turns the class into \\placeholder{}. A `[[…]]` inside backticks is
left alone: that is the notice explaining the convention, not a placeholder.
"""

import re
import sys

PLACEHOLDER = re.compile(r"(?<!`)\[\[([^\]]+)\]\](?!`)")

sys.stdout.write(PLACEHOLDER.sub(r"[\1]{.placeholder}", sys.stdin.read()))
