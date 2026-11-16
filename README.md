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

- **Entity level** — one asset is the focus; its upstream tables sit to the
  left and its readers to the right, grouped into bronze, silver and gold
  bands. Hover a table to trace its path, click it for details, double-click
  to focus on it. `+N` / `−` on a card's edge show or hide more lineage.
- **Column level** — the same graph, with a chevron on each card that opens
  it onto its columns (the first 8, then "+N more columns").
- The focus and the level are in the URL (`?asset=gold.gold_brand360&level=column`),
  so any view can be linked to.

## Layout

```
src/app/                      App (the router is only for the URL), ErrorBoundary
src/features/lineage/         constants, mocks (fixtures), lineageGraph (pure graph walks)
  pages/EntityLineage/        the screen: canvas, cards, rail, details panel, layout maths
src/components/ui/            Button, Icon, SearchInput, SegmentedControl, Skeleton
src/styles/                   tokens.css, base.css
```

## Data

The app runs on fixtures in `src/features/lineage/mocks.js`, served by
`useLineageData` behind a short `MOCK_LATENCY_MS` delay so the loading state is
real. When an API exists, replace the timeout in that hook with a fetch that
returns assets in the same shape (each with its `upstream` ids and `columns`),
and delete the constant.
