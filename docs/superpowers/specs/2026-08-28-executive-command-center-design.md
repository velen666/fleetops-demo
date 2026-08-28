# Executive Command Center — UI/UX refactor

## Purpose

Turn the FleetOps demo from a functional, flat admin dashboard into a credible B2B operations command centre. The UI must lead a client through a management decision: understand the portfolio state, see the largest operational risk and its cost, open the next action, then drill down into verifiable evidence.

The existing deterministic data, RBAC, economic model, incident workflow and acceptance route remain the source of truth. This change is presentation and interaction architecture only.

## Chosen direction

Use the **Executive Command Center** direction: a restrained dark-blue enterprise interface with a single decision-oriented hero per role, no more than four first-viewport KPIs, matte data surfaces, and glass only for the app shell, page hero and top-level summary cards.

This is preferred over a more colourful technical-observatory treatment because it reads as a serious operations system in a customer demonstration without obscuring alarms, tables, or evidence.

## Scope

### Shared visual primitives

- Bring the implementation back in line with `DESIGN.md`: load Montserrat, make the `blue-cyan-violet` dark theme the initial default, and consume the existing semantic and L3 gradient/glass tokens.
- Add reusable presentation primitives rather than page-local effects: page hero, compact/decision/glass card treatments, semantic status treatment, and reduced-motion handling.
- Give the shared `Button` an accessible 44px default target and gradient primary treatment. Existing dense toolbar variants may remain compact.
- Make `ChartCard` resolve its palette, grid, labels and tooltip colours from the active CSS tokens. No chart data or formulas change.
- Rebuild the application shell around a glass sidebar/header, grouped navigation, a role/context line and a bounded content container.

### Decision-first pages

- **Portfolio:** retain the existing portfolio verdict and data, but present it as the primary hero, reduce first-view metrics to four decision signals, and make object cards easier to scan and open.
- **My site:** move the existing attention item into an Operations Pulse directly below the page context. It must name the affected zone, available reserve and drill-down action without changing the incident journey.
- **Analytics:** add an insight panel before filters/charts that states the dominant confirmed loss, affected coverage and existing recommended action. Filters and all analytical detail remain available.
- **Incident detail:** express the existing two control points as a clear status rail. It exposes the existing next action as the only primary action while retaining permissions and all currently available actions.

### Explicit non-goals

- No change to `generator.ts`, metric passports, calculations, demo totals, roles, permissions, guards, persistence semantics, routes, or acceptance flow.
- No invented ROI, trends, real-time data, financial claims, or new data fields.
- No glass effects inside tables, list rows, form controls or nested cards.
- No broad conversion of every legacy native control in this iteration; any touched primary-flow control must use the project UI primitives and preserve keyboard access.

## Information hierarchy

For each role home, the first viewport follows this order:

1. **Context:** role, responsible scope and fixed 30-day demo period.
2. **Decision:** portfolio/site verdict and the one condition that most needs attention.
3. **Signals:** up to four traceable KPIs, each retaining its existing drill-down route.
4. **Action:** a specific existing drill-down (site, zone or incident).
5. **Evidence:** records, charts, tables and full filters.

Data-dense views retain their detailed evidence, but their first screen will surface the strongest existing conclusion before the tools used to investigate it.

## Component boundaries

| Unit | Responsibility | Dependencies |
| --- | --- | --- |
| CSS tokens and utility classes | Theme-consistent surface, motion and state treatment | Existing L1–L3 tokens only |
| `Card` and `Button` variants | Consistent elevation, density, action affordance | shadcn-vue primitives, class variance |
| `ChartCard` | Theme-aware chart presentation | CSS custom properties, existing Chart.js data/options |
| `DashboardLayout` | Navigation, role/presentation context and bounded workspace | Router, active role, UI button |
| Page-level decision modules | Assemble existing computed data into decision + evidence sequence | Existing page composables and routes |

No presentation component may calculate availability, downtime, money or permission outcomes; it receives already-defined values from the current pages/store.

## Motion and accessibility

- Use a 150–200ms easing range for hover/focus and the existing 1px lift only on actionable cards; do not animate numerical data or status changes.
- Respect `prefers-reduced-motion: reduce` by removing non-essential transitions and transforms.
- Interactive cards must be an actual link or button, with visible focus and a text/label companion for all status colour.
- Keep dense tables matte, with scan-friendly hover and semantic status wording.

## Acceptance evidence

1. Type, lint, formatter, unit data validator and production build pass.
2. Playwright acceptance suite passes; this is the highest automated gate.
3. A desktop browser check captures the role home and an incident route in dark default theme: the hero, decision/action path, first four KPI signals and dense evidence are visible and legible.
4. The deterministic data validator confirms the unchanged demo contract.
5. A scoped diff confirms that no generator, metric, role, guard or route contract was changed unless explicitly documented.

## Stop conditions

Stop for user direction if the visual work requires an altered business action, permission, role route, acceptance number, data source, or a new financial assertion. If installing dependencies is necessary for verification, it is an in-scope local development prerequisite; report any network or installation failure rather than substituting a claimed visual pass.
