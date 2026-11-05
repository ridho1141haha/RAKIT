# RAKIT — Design System

An **editorial productivity workspace**: warm paper surfaces, deep charcoal structure, one
vermilion accent. Reads like a carefully typeset document, behaves like a precision tool.
Inspired by the *discipline* of Linear/Notion — never their pixels.

## 1. Typography

| Role | Face | Notes |
| --- | --- | --- |
| Display / page titles | **Fraunces** (variable serif) | `font-display`, tight tracking, 600–700. The "masthead" voice. |
| UI / body | **Space Grotesk** (variable sans) | `font-sans`, 400–500 body, 600 labels. |
| Technical metadata | **JetBrains Mono** (variable) | `font-mono` — dates, IDs, counts, section labels (uppercase, tracking-widest). |

Self-hosted in `public/fonts/*.woff2` via `@font-face` in `globals.css`. No Inter.

Scale: page title `text-2xl/3xl font-display`, section label `text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground`, body `text-sm`, metadata `text-xs font-mono`.

## 2. Color

### Light — "Kertas"
```
--background:      #FAF8F4   warm paper
--foreground:      #211D19   deep charcoal-brown ink
--card:            #FFFFFF
--muted:           #F0EDE6   (stripes, wells)
--muted-foreground:#7D756A
--border:          #E6E1D7
--primary:         #211D19   (charcoal buttons)
--brand:           #D9481F   vermilion  ← the ONE accent
--brand-foreground:#FFF6F1
--focus ring:      brand @ 40%
```

### Dark — "Arang"
```
--background:#141210  --card:#1C1916  --border:#2B2723
--foreground:#EDE7DD  --muted:#211E1A  --brand:#FF6A3D
```

### Semantic accents (used sparingly, flat — no gradients)
- Status: planning `#8A8578` · active `#2F7D4F` · on-hold `#B98A1F` · completed `#211D19` (inverted pill) · archived `#9A938A`
- Priority: URGENT `#D9481F` · HIGH `#B9541B` · MEDIUM `#8A6D2F` · LOW `#7D756A`
- Danger uses `--destructive`. **Never** blue/purple/indigo.

## 3. Shape, space, texture

- Radius: `--radius: 0.5rem`; inputs/buttons `rounded-md`; cards `rounded-lg`; pills `rounded-full`.
- **Cards are not nested.** Sections are separated by rules (`border-t`) and whitespace, not boxed cards inside cards.
- Surfaces: paper `bg-background`, wells `bg-muted/60`, elevated `bg-card border shadow-none` (shadow only on popovers/dialogs).
- Page gutter: `px-6 lg:px-10 py-8`; max content width `max-w-6xl` (docs/settings) or full-bleed (board/timeline).
- Dividers: 1px `border-border`; key separations use a **double-rule** motif: 3px charcoal bar + hairline (`.rule-strong`).

## 4. Editorial motifs (RAKIT's signature)

1. **Masthead header** — every view opens with: mono kicker (workspace · section) → Fraunces title → quiet description. Like a newspaper section front.
2. **Mono metadata rows** — counts, dates, IDs in JetBrains Mono uppercase; gives the "typeset archive" feel.
3. **Hairline tables** — rows separated by borders, no zebra, no card-per-row.
4. **The vermilion dot** — unread state, urgent priority, active drag target, logo period (`RAKIT.`).
5. **Progress = thin charcoal track + vermilion fill** (2px–4px), never a chunky progress bar.
6. **Whitespace is layout** — density comes from typography, not boxes.

## 5. Motion (restrained)

- Durations 120–200ms, ease-out. Hover: border darkens + slight bg shift. No bounce, no glow.
- Dialogs/popovers: fade + 2px rise. Kanban drop: 150ms settle. Skeletons for all async loads.
- Framer Motion is available; use for view-mount fades and list reorders only.

## 6. Components & conventions

- shadcn/ui (New York) primitives, restyled via tokens. No new icon-per-text; icons only where actionable.
- Badges: `StatusBadge` (dot + mono label), priority as small mono text with colored dot.
- Avatars: initials on deterministic charcoal/vermilion/olive backgrounds (no images needed).
- Empty states: kicker + one sentence + one action button. Explain the next step, always.
- Forms: label above, validation inline in vermilion/danger, submit disabled while pending.
- Destructive actions: AlertDialog confirmation, typed confirmation for workspace deletion.
- Scrollable regions: `max-h-96 overflow-y-auto` + thin custom scrollbar (see globals.css).

## 7. Layout grammar

- **App shell**: fixed left sidebar (240px, collapsible ≥ md, Sheet on mobile) + topbar (search trigger, notifications, user) + content. Footer strip: mono "RAKIT · {workspace}" + shortcut hint — sticky bottom via `mt-auto` on the shell column.
- **Project detail**: masthead + underline tab nav (Ringkasan/Board/Daftar/Timeline/Milestone/Dokumen/Aktivitas). Board is full-height with its own horizontal scroll.
- **Dashboard**: editorial grid — full-width stats strip (hairline-divided), then 2:1 split (projects+activity | deadlines+my tasks+weekly chart). No identical widget cards.
- **Inbox**: two-pane — left list with filters, right reading pane (mobile: stacked with sheet).

## 8. Accessibility

Semantic landmarks (`header/nav/main/aside`), focus-visible rings everywhere, all interactive
targets ≥ 44px on touch, `aria-label`s on icon buttons, keyboard: Tab order mirrors visual,
palette/shortcuts ignore text inputs, contrast ≥ AA for text (charcoal on paper ≈ 14.9:1).
