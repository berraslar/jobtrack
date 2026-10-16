---
version: 1
slug: 'src'
primary_target: 'src'
related_targets: []
---

# Surface: JobTrack web app (landing, auth and all authenticated screens)

Scope: the whole web UI in apps/web/src. Visitor mode: Operate for the app (list, Kanban, detail, dashboard, settings); Persuade for the public landing page. User request (2026-10-14): replace the "Ruled Ledger" look with the pastel-gradient world of a third-party reference image (kept outside the repo, in docs/ornek/), across the whole app, with motion that is noticeable but never in the way. Portfolio screenshots matter; daily desktop use leads.

Constraints: preserve every function, route, accessible name and visible Turkish/English copy used by tests; WCAG 2.2 AA in both themes; 360 px with no horizontal scroll; strict CSP (self-hosted fonts, no third-party requests); JS budget 200 KB gzip; prefers-reduced-motion respected.

## Direction contract

THESIS: JobTrack is a sunlit pastel studio for one person's job search: soft peach, lilac and sky light washing across a white working sheet, every application a rounded card you can pick up and move. It refuses both the old hairline ledger and the category default of a gray admin panel with a blue primary.

OWN-WORLD: A drifting aurora ground of peach (#ffd9c7), lilac (#dcd3ff) and sky (#c9e8ff) blobs; white sheets with 20-28px radii and long, soft, plum-tinted shadows. Deep aubergine ink (#2a2140). Butter-yellow pill primary buttons (#ffd23f) with ink text; secondary is a white pill with a plum hairline. Each stage owns a pastel chip (peach, lilac, sky, mint, butter, rose) always paired with its label. Bricolage Grotesque for display, Figtree for UI and body, tabular figures. Dark: plum night (#16121f) with dim glowing blobs and the same pastels raised in lightness.

STORY: She opens JobTrack to a calm, colorful board, sees the follow-ups and interviews that need her today, and moves an application forward with one click or a drag; the card answers with a lift and the stage path fills to its new position.

FIRST VIEWPORT: Desktop app: a floating white rail at the left (wordmark with a three-color blob mark, pill navigation whose active pill slides between items, language/theme/sign-out at the foot) over the aurora ground; the page title (Bricolage, 2.5rem) with a lilac count pill sits directly on the aurora with the butter "Yeni başvuru" pill at the right; below it a pastel today band (follow-ups butter, or rose when any are due; next interview sky), then the filters and the list or board as separate rounded white sheets. Adaptation, recorded 2026-10-14: the original plan wrapped the whole column in one large sheet, which would nest the filter and table sheets inside it; separate sheets on the ground were kept instead. Landing: left-aligned headline at 4.5rem over a peach-to-lilac wash with a big curved edge, butter CTA; at the right a live mini-board where a demo card glides from "Başvuruldu" to "Mülakat" and its stage path fills.

FORM: Pinned by the user (pastel gradient reference, image 3), which beats the roll; the roll's seed key is f0dde7bd (printed by concept-seed --scope direction --mode operate on 2026-10-14, assigned index 7; no decision page was served because the user's choice pinned the direction, so no decision-direction.json carries it). Raise kept from the declined acetate-manual challenger: stage hue is a system, not decoration; every stage has one fixed pastel used in chips, Kanban column heads, timeline dots and the stage path. Charts use one lilac series instead, because the palette validator showed the pastel stage hues fail as categorical chart colors (recorded 2026-10-14). Signature interaction: the stage path, a rounded pastel track whose fill and marker glide (420ms cubic-bezier(0.16,1,0.3,1)) when the stage changes. Motion grammar: aurora drift (ambient, paused under reduced motion), view-transition cross-fade and sliding active nav pill on route change, list stagger on first paint (capped), counters and bars that fill on the dashboard, Kanban card lift.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
