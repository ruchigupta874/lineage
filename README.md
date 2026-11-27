# Entity Lineage

The entity lineage screen from context_platform, as a standalone app. It opens
on the enterprise lineage overview (`/`); picking an asset there opens its
lineage on the lineage page (`/lineage?asset=…`).

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

### Layers, and assets with none

Not every catalog is bronze, silver and gold. A workspace lists its own layers
in flow order (bronze → silver → gold, or landing → raw → curated →
consumption, or none at all), and both pages draw any of them the same way:

- **Left to right is the flow.** An asset's column is how far downstream it
  sits. The workspace's layer order is a floor on top of that, so a later layer
  is never drawn left of an earlier one; an all-medallion workspace looks
  exactly as it did before layers were opened up.
- **The layer is a colour.** Bronze, silver and gold keep their metals; a
  workspace's own layers get one of five other colours, in its order.
- **Unclassified** — in the catalog with no layer set: plain white card, grey
  icon, placed purely by the flow.
- **Not in catalog** — named by lineage (a CSV on SFTP, a Kafka topic, an API)
  but with no catalog record: a dashed card with no schema, owner or health. A
  column trace that reaches one stops there and says where the value comes
  from. Before, such inputs were dropped.
- **Labels that contradict the flow** (a consumption table feeding a curated
  one) — the flow wins, and the details panel says why the card isn't where
  its label would put it.

All of this is settled once, in `features/lineage/catalog.js`.

### Enterprise lineage (`/`, the home page)

- Every asset in the workspace on one canvas: one-line cards in their layer's
  colour, laid out by the same layout as the lineage page. Hover a card to
  trace its path; click it to open its lineage.
- **Search** — the same field as the lineage page, at entity level: it finds
  tables, and picking one opens the lineage page with it as the focus.
- The header's legend counts the assets per layer, including Unclassified and
  Not in catalog; click one to highlight its assets on the canvas. The header
  also holds the **workspace** picker (Pharma, Retail, Finance — see Data),
  **Sync Lineage** (mocked: it waits, then moves **Last Sync** to now) and an
  insights button that is a placeholder.
- The workspace is in the URL (`?workspace=retail`) and carries to the lineage
  page and back.

### Lineage (`/lineage`)

- The arrow at the left of the top bar goes back to enterprise lineage.
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
- **All lineage** — with no table traced (where the chip's × returns to), the
  canvas shows every table in the catalog.
- **Entity level** — one asset is the focus; its upstream tables sit to the
  left and its readers to the right. A heading over each column names the
  layers in it (one heading across a run of columns in the same layer; dots
  and counts where a narrow column mixes layers). Hover a table to trace its
  path, click it for details, double-click to focus on it. `+N` / `−` on a
  card's edge show or hide more lineage.
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
  (`/lineage?asset=gold.gold_brand360&level=column&column=gold.gold_brand360.units&trace=all`),
  so any view can be linked to. Older links to `/?asset=…` are redirected to
  `/lineage`.

## Layout

```
src/app/                      App (routes: / and /lineage), ErrorBoundary
src/config/constants/         routes, shared tones
src/features/lineage/         constants, catalog (layers, assets outside the catalog),
                              lineageGraph (pure graph walks), mocks/ (one file per workspace)
  pages/EnterpriseLineage/    the home page: header, compact canvas cards
  pages/EntityLineage/        the lineage page: top bar (lens tabs, search), canvas, cards,
                              details panel, layout maths (shared with the home page)
src/components/ui/            Button, Icon, SearchInput, SegmentedControl, Skeleton
src/styles/                   tokens.css, base.css, layers.css (layer colours by data-hue)
```

## Data

The app runs on fixtures in `src/features/lineage/mocks/`, one per workspace,
each a different shape of catalog:

- **Pharma** — all medallion, everything catalogued: the clean case.
- **Retail** — its own layers (landing, raw, curated, consumption), staging
  tables and a calendar with no layer, a table mid-migration labelled `silver`,
  four inputs and outputs outside the catalog plus one input lineage names but
  nothing describes, a consumption table a curated one reads, and a mart column
  filled from an outside API.
- **Finance** — no layers at all, one input outside the catalog.
- **Telecom** — the big one: about 75 assets, a longest path of 22 hops
  (network records through rating, sessions and usage, into churn features, a
  model outside the catalog, scores, retention targets and the exports that
  leave), most tables 20 to 30 columns, every column with its lineage. Its
  tables are built with small `source` / `derive` / `rollup` helpers rather
  than column by column, and a check at load time throws if any column reads
  something that isn't a column of its table's inputs.
- **Telecom (medallion)** — the same catalog, but knowing only bronze, silver
  and gold: everything else is unclassified. It sets `layerBands`, so its
  lineage page draws the layers as bands, the way the medallion canvas first
  looked — a bronze, silver and gold lane, and a grey lane wherever
  unclassified or uncatalogued assets sit between them (each joins the gap
  just past the latest layer upstream of it, or, with none upstream, the gap
  just before what it feeds). Its home page is drawn like the others.

`useLineageData(workspaceId)` serves one behind a short `MOCK_LATENCY_MS`
delay so the loading state is real, resolved through `resolveCatalog`. When an
API exists, replace the timeout with a fetch that returns the workspace's
layer list, its assets in the same shape (each with its `layer` id or none,
`upstream` ids, `columns` and column `derivations`), what lineage knows about
assets outside the catalog, and the last sync time; make `sync` call the real
sync; and delete the constants.
