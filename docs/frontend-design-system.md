# Frontend Design System

The panel is a React 19 + Vite SPA with **zero CSS framework** — design tokens as CSS custom properties, co-located plain CSS per component, and CSS **logical properties only** so RTL Persian comes free.

## Tokens

`apps/panel/src/styles/tokens.css` defines every primitive. Components never hard-code values (the few `#fff` literals sit on brand-gradient surfaces where white is correct in both themes).

| Group | Examples |
|---|---|
| Brand ramp | `--brand-50…900` (600 = `#7e14ff`, matches the logo) |
| Semantic | `--color-primary/-soft`, `--color-success/warning/danger/info`, surfaces `--color-surface` → `--color-surface-3`, `--color-border/-strong`, `--color-text`/`-secondary`/`-muted` |
| Charts | `--chart-series-1…4`, tooltip bg/text |
| Spacing | `--space-1…12` (4 px base) |
| Radius / shadows | `--radius-sm…xl`, `--shadow-xs…lg`, `--shadow-primary` |
| Type | `--text-xs…3xl`, `--fw-medium/semibold/bold` |
| Layout | `--sidebar-w: 248px`, `--topbar-h: 64px` |
| Motion | `--transition-fast`, `--transition` |

**Dark theme** overrides the semantic subset under `[data-theme="dark"]` on `<html>`. An inline script in `index.html` applies stored theme + language before React boots (no FOUC, no flash of LTR).

## Typography & direction

- Font: **Vazirmatn**, self-hosted via the `vazirmatn` npm package (no CDN).
- Language switch sets `lang` and `dir` on `<html>`; components respond via logical properties (`padding-inline-start`, `inset-inline-end`, `margin-inline-end`).
- User-generated / technical strings carry explicit `dir="auto"` (names) or `dir="ltr"` + `.mono` (UUIDs, URIs, hosts) so Persian UI labels never corrupt them.
- Numbers are Latin digits even in Persian (`fa-IR-u-nu-latn` in `lib/format.ts`).

## UI kit (`src/components/ui/`)

All components accept `className`, forward props, and are keyboard/screen-reader accessible (focus-visible rings, `aria-label` where icon-only).

| Component | Notes |
|---|---|
| Button | variants primary/secondary/ghost/danger/soft; sizes; `loading` shows spinner |
| Input / Select / Checkbox / Switch | label, hint, error; Switch thumb mirrors in RTL |
| Card | padded by default, `padded={false}` for tables; `hoverable` |
| Table<Row> | typed columns `{key, header, render, align, width}`; skeleton rows; empty slot |
| Modal | portal, Esc + backdrop close, sizes sm/md/lg |
| ConfirmDialog | danger-styled modal for destructive actions |
| Badge | tones: primary, success, warning, danger, info, neutral (+ dot) |
| SegmentedControl / Tabs | exclusive option pickers; used for protocol/theme/role |
| DropdownMenu | click-outside + Esc; `danger`/`disabled` items |
| Pagination | chevrons `scaleX(-1)` under `[dir="rtl"]` |
| CopyButton | clipboard with execCommand fallback; check feedback |
| EmptyState, Spinner, ProgressBar | ProgressBar flips to warning/danger tone at 80/95 % |
| Toast | portal host, 4 s auto-dismiss, success/error/info |

Charts (`components/charts/`) are **hand-rolled SVG** — line + bar with nice-axis ticks and tooltips — using `--chart-series-*`; no chart library, so they theme and render identically in both languages.

## Conventions

1. One folder per page: `pages/<Name>/<Name>.tsx` + `<Name>.css` (imported by the component).
2. Data access **only** through `lib/api` (`getApi()`), typed by the `ApiClient` interface — pages never touch fetch.
3. Async interactions: local `saving`/`loading` states → toast on outcome → `refetch()`.
4. Destructive actions always go through `ConfirmDialog`.
5. i18n keys are nested and typed (`t("users.table.username")`); both `en.json` and `fa.json` must stay shape-identical (enforced by the `Dictionary` type).
6. Icons: `lucide-react` at 15–16 px in tables/menus, 24 px in empty states.
