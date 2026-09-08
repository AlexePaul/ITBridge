-- Pandoc filter for the PDF edition of the legal documents — E22 S2.
--
-- The Markdown is written for the repository as much as for the reader: it links the other
-- documents by file name, it links the README, and it marks what is still missing with [[…]].
-- On paper each of those needs a different shape, and this is where it gets it.

local SITE = "https://itbridgeschool.com"

-- A link between the documents becomes a link to the public page; the README is not a page.
local PAGES = {
  ["termeni-si-conditii.md"] = SITE .. "/termeni",
  ["politica-de-confidentialitate.md"] = SITE .. "/confidentialitate",
  ["politica-de-cookies.md"] = SITE .. "/cookies",
}

function Link(link)
  if link.target == "README.md" then
    return link.content
  end
  local page = PAGES[link.target]
  if page then
    link.target = page
    return link
  end
  return link
end

-- `[X]{.placeholder}` (from placeholders.py) → \placeholder{X}, breakable across lines.
function Span(span)
  if not span.classes:includes("placeholder") then
    return nil
  end
  local out = { pandoc.RawInline("latex", "\\placeholder{") }
  for _, inline in ipairs(span.content) do
    table.insert(out, inline)
  end
  table.insert(out, pandoc.RawInline("latex", "}"))
  return out
end

-- The first bold line — „Versiunea 0.1 · ciornă din …" — becomes a boxed notice under the title,
-- and the table of contents follows it rather than pushing it to the bottom of the page. build.sh
-- therefore does not pass --toc; the contents are emitted here, once.
local notice_done = false
local toc_done = false

local TOC = pandoc.RawBlock("latex", "\\tableofcontents")

function Para(para)
  if notice_done then
    return nil
  end
  local first = para.content[1]
  if first and first.t == "Strong" and pandoc.utils.stringify(first):match("^Versiunea") then
    notice_done = true
    toc_done = true
    local latex = pandoc.write(pandoc.Pandoc({ pandoc.Para(para.content) }), "latex")
    return {
      pandoc.RawBlock("latex", "\\begin{draftnotice}\n" .. latex .. "\\end{draftnotice}"),
      TOC,
    }
  end
  return nil
end

-- A document without the draft line — a published one — still opens with its contents.
function Pandoc(doc)
  if not toc_done then
    doc.blocks:insert(1, TOC)
  end
  return doc
end

-- The rule right under that notice is the Markdown's, not the page's.
local rule_done = false

function HorizontalRule(rule)
  if notice_done and not rule_done then
    rule_done = true
    return {}
  end
  return nil
end

-- Column widths come from the dash line under the table header, which prettier pads to the widest
-- cell; a column of short names next to a column of sentences ends up too narrow for a name that
-- cannot break (`refreshToken`, in monospace). No column goes under a fifth of the width; the
-- difference comes out of the wide ones, in proportion.
local MIN_COLUMN_WIDTH = 0.2

function Table(tbl)
  local specs = tbl.colspecs
  if #specs < 2 then
    return nil
  end
  local widths, wide_sum, deficit, lifted = {}, 0, 0, {}
  for i, spec in ipairs(specs) do
    local width = spec[2]
    if type(width) ~= "number" then
      return nil
    end
    if width < MIN_COLUMN_WIDTH then
      lifted[i] = true
      deficit = deficit + (MIN_COLUMN_WIDTH - width)
      widths[i] = MIN_COLUMN_WIDTH
    else
      wide_sum = wide_sum + width
      widths[i] = width
    end
  end
  if deficit == 0 or wide_sum == 0 then
    return nil
  end
  for i, width in ipairs(widths) do
    if not lifted[i] then
      widths[i] = width - deficit * (width / wide_sum)
    end
  end
  for i, spec in ipairs(specs) do
    specs[i] = { spec[1], widths[i] }
  end
  tbl.colspecs = specs
  return tbl
end
