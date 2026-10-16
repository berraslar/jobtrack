# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One primary user: Berra, actively job hunting. She works in daily desktop sessions: logging new applications, moving them through stages after interviews or rejections, recording interviews and calls, and checking the dashboard to see what is working. Phone use is secondary (quick checks). The architecture is multi-user-ready (every record belongs to one user), but there is no team use.

Secondary audience: recruiters and engineers who see the project in Berra's GitHub portfolio through README screenshots. They judge craft at a glance; they never operate the app.

## Product Purpose

JobTrack is a personal CRM for job applications: it tracks each application from "saved" to offer or rejection, keeps the stage history and interview timeline, records which CV version was sent, and shows which CVs and sources actually get responses. Success means the user always knows what needs attention today (follow-ups, upcoming interviews) and can learn from her own pipeline.

## Positioning

A single person's job search run with enterprise-grade discipline: stage history written by the database, per-CV and per-source conversion funnels from that history, server-side sessions with TOTP, row-level security, KVKK export and deletion. It is both a tool she uses daily and a portfolio piece proving security, testing and accessibility craft.

## Operating Context

- Daily desktop sessions; light and dark themes both supported (system preference by default).
- Turkish is the default language; English is fully supported (FR-16). Turkish strings run longer than English in places.
- Core flows: application list (search, filters) and Kanban board; application detail (stage, history, activities); companies; CV versions with PDF upload by drag and drop; dashboard (stage distribution, response/interview/offer rates, by CV and source, weekly chart); settings (follow-up days, TOTP, sessions, export, account deletion).
- Follow-up flag after N days without activity (FR-11); upcoming interviews export to .ics.

## Capabilities and Constraints

- React 19 + Vite + Tailwind CSS v4; tokens live in `apps/web/src/index.css` (`@theme`).
- Strict CSP: `default-src 'self'`, `style-src 'self'`, `font-src 'self'`, no inline scripts, no third-party requests. Any font must be self-hosted; no CDN assets.
- Initial JS budget: 200 KB gzip (NFR-05); currently about 131 KB.
- No `dangerouslySetInnerHTML`. Route URLs are Turkish slugs and must not change.
- Existing unit, integration and Playwright end-to-end tests (including axe WCAG 2.2 AA scans and a 360 px no-horizontal-scroll check) select elements by accessible names and visible Turkish text; those names and texts are product copy and stay.

## Brand Commitments

- Name: "JobTrack". No logo, color, or typeface commitments; the visual identity may be rebuilt freely.
- Requested feel (user, 2026-10-07): calm and professional.

## Evidence on Hand

- No real screenshots, logos or marketing assets yet. Demo data for screenshots must be clearly synthetic.
- No testimonials, users or metrics exist; none may be invented.

## Product Principles

1. What needs attention today comes first: follow-ups, next interviews, current stage.
2. Every action has a keyboard and single-pointer path; drag and drop is never the only way.
3. Truth over decoration: numbers come from stage history, and the interface never implies more than the data says.
4. Privacy is visible: sensitive actions (export, deletion, sessions) are explicit and calm, never hidden.

## Accessibility & Inclusion

WCAG 2.2 AA (NFR-06), verified by axe in end-to-end tests plus manual keyboard and screen reader checks; targets at least 24×24 px (2.5.8); `prefers-reduced-motion` respected; responsive from 360 px to desktop (NFR-10).
