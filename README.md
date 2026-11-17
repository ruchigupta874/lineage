# Entity Lineage

The entity lineage screen from context_platform, as a standalone app: open it
and the lineage canvas is the whole page.

React 19 + Vite, JavaScript with `prop-types`, CSS Modules on the design tokens
in `src/styles/tokens.css`. No component library, no Tailwind.

## Commands

```
npm install
npm run dev       # vite dev server
npm run build     # production build
npm run lint      # eslint
npm run format    # prettier --write .
```

## What it does

- **Technical / Business** — tabs in the top bar pick which lineage the page
  shows. Each is read at entity or column level, switched in the stage header.
  Business has no data yet and says so.
- **Search** — the field in the top bar works at the grain the page is drawn
  at. At entity level it finds tables (name first, then layer, owner, source
  and description). At column level it finds columns — every table holding a
  column by that name, narrowed by a table or layer word (“silver age”) — and
  tables after them; picking a column focuses its table and traces it. It marks
  what matched and offers what was traced recently before anything is typed.
  `/` or `Ctrl+K` focuses it; arrows move, Enter traces, Escape backs out.
  What is traced shows as chips in the field — table › column — and each ×
  steps back one.
- **All lineage** — with no table traced (how the page opens, and where the
  chip's × returns to), the canvas shows every table in the catalog.
- **Entity level** — one asset is the focus; its upstream tables sit to the
  left and its readers to the right, grouped into bronze, silver and gold
  bands. Hover a table to trace its path, click it for details, double-click
  to focus on it. `+N` / `−` on a card's edge show or hide more lineage.
- **Column level** — the same graph, with a chevron on each card that opens
  it onto its columns (the first 8, then "+N more columns").
- **Column trace** — click a column and the canvas gives way to its lineage:
  only the tables its path runs through, path columns marked and joined row
  to row. It starts confined to the tables that were in view; "Trace
  end-to-end lineage" widens it to the whole catalog. A details pane opens as
  its own column of the page, beside the whole stage, with the column's **Technical
  Provenance** — the transformation and its logic, the tree of columns it was
  derived from back to bronze, and what reads it — and an **AI Governance**
  tab (placeholder). The rule between them drags from 70 : 30 to 80 : 20
  (arrow keys too; double-click flips ends), and the width is remembered.
  "Exit focus" goes back.
- The focus, the lens, the level and a traced column are in the URL
  (`?asset=gold.gold_brand360&level=column&column=gold.gold_brand360.units&trace=all`),
  so any view can be linked to.

## Layout

```
src/app/                      App (the router is only for the URL), ErrorBoundary
src/features/lineage/         constants, mocks (fixtures), lineageGraph (pure graph walks)
  pages/EntityLineage/        the screen: top bar (lens tabs, search), canvas, cards,
                              details panel, layout maths
src/components/ui/            Button, Icon, SearchInput, SegmentedControl, Skeleton
src/styles/                   tokens.css, base.css
```

## Data

The app runs on fixtures in `src/features/lineage/mocks.js`, served by
`useLineageData` behind a short `MOCK_LATENCY_MS` delay so the loading state is
real. When an API exists, replace the timeout in that hook with a fetch that
returns assets in the same shape (each with its `upstream` ids, `columns` and column `derivations`),
and delete the constant.
