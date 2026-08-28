# Executive Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Refactor the FleetOps demo into a polished, decision-first B2B operations cockpit while preserving all demo data and workflows.

**Architecture:** Reuse existing L1–L3 tokens and page computations; add presentation primitives to the CSS/shared components and compose them on existing role pages. The shell establishes persistent context, pages surface a decision before evidence, and ChartCard reads semantic theme tokens.

**Tech Stack:** Vue 3, TypeScript, Vite, Tailwind v4, shadcn-vue, Chart.js, Pinia, Playwright.

**Spec:** docs/superpowers/specs/2026-08-28-executive-command-center-design.md

## Global Constraints

- Do not change src/data/generator.ts, metric passports, calculations, roles, permissions, guards, persistence semantics, routes, or acceptance flow.
- Use existing design tokens and --status-* for colour; do not introduce raw HEX in Vue components.
- Apply glass only to the shell, page heroes, modals and top-level summary cards; tables and rows remain flat.
- Preserve drill-down destinations and deterministic data labels.
- Limit motion to 150–200ms UI feedback and respect prefers-reduced-motion: reduce.
- A user-visible control touched by this work must use shadcn-vue and remain keyboard accessible.

---

## File structure and ownership

- src/assets/styles/style.css: canonical font, semantic presentation primitives, motion/fallback rules.
- index.html: initial palette source of truth.
- src/components/ui/card/Card.vue and src/components/ui/button/index.ts: shared surface/action variants.
- src/components/ChartCard.vue: Chart.js visual adapter over CSS tokens.
- src/layouts/DashboardLayout.vue: bounded shell, role context and grouped navigation.
- src/pages/PortfolioPage.vue, src/pages/MySitePage.vue, src/pages/AnalyticsPage.vue, src/pages/IncidentDetailsPage.vue: existing data recomposed into a decision-first hierarchy.
- DESIGN.md and AGENTS.md: durable architectural/design rule for the presentation layer.

### Task 1: Establish the visual foundation

**Files:**

- Modify: index.html
- Modify: src/assets/styles/style.css
- Modify: src/components/ui/card/Card.vue
- Modify: src/components/ui/button/index.ts
- Modify: DESIGN.md
- Modify: AGENTS.md

**Interfaces:**

- Produces CSS classes app-shell, app-sidebar, app-header, page-hero, card-glass, card-decision, card-data and status-pill.
- Produces Card variants tone: plain | glass | data | decision, plus density: compact | default | spacious.
- Produces a Button default height of 44px, retaining compact toolbar variants.

- [x] **Step 1: Capture baseline**

Run:

```powershell
rg -n "Inter|Montserrat|theme-palette|card-glass|gradient-primary" index.html src/assets/styles/style.css DESIGN.md
```

Expected: Inter is imported, Montserrat is specified but not loaded, blue is selected by initial markup, and L3 presentation tokens lack component use.

- [x] **Step 2: Align typography, theme, surface and motion rules**

Implement:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
.page-hero {
  background: var(--gradient-hero);
}
.card-glass {
  background: var(--gradient-surface);
  backdrop-filter: blur(16px) saturate(140%);
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }
}
```

Set blue-cyan-violet in index.html and its localStorage fallback. Extend shared Card/Button variants so pages reuse a coherent tonal/density language.

- [x] **Step 3: Check visual contract**

```powershell
npm run lint
npm run type-check
rg -n "@import.*Montserrat|page-hero|card-glass|prefers-reduced-motion" src/assets/styles/style.css
```

Expected: lint/type checks pass and primitives are present.

- [x] **Step 4: Document the runtime rule**

Add to DESIGN.md and AGENTS.md: decision surfaces use shared primitives; shell/hero/top-level cards may be glass; data tables stay matte; palette-aware components read semantic CSS tokens.

- [x] **Step 5: Commit**

```powershell
git add index.html src/assets/styles/style.css src/components/ui/card/Card.vue src/components/ui/button/index.ts DESIGN.md AGENTS.md
git commit -m "demo: establish executive command center visual foundation"
```

### Task 2: Make the shell and charts presentation-aware

**Files:**

- Modify: src/layouts/DashboardLayout.vue
- Modify: src/components/ChartCard.vue

**Interfaces:**

- Consumes Task 1 classes and active role/router data.
- Produces a bounded shell with role, scope and 30-day context.
- Produces ChartCard options generated from --chart-1..5, --muted-foreground, --border, --popover and --foreground.

- [ ] **Step 1: Write a pure chart-theme adapter**

```ts
function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
function chartTheme(): ChartTheme {
  return {
    palette: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map(cssToken),
    grid: cssToken('--border'),
  }
}
```

- [ ] **Step 2: Prove the adapter type-checks before replacing raw palette values**

```powershell
npm run type-check
```

Expected: the app is type-safe; next step removes hardcoded chart colours.

- [ ] **Step 3: Apply the chart adapter and refactor shell**

Use chartTheme() for dataset, grid/tick and tooltip colours. Replace native navigation controls with semantic Button controls. Use grouped navigation, glass shell classes, a header context line and a max-w-[1440px] page workspace:

```vue
<p class="text-xs text-muted-foreground">
  {{ auth.user?.role }} · 30 дней · демонстрационный срез
</p>
```

Keep route names and permission filtering unchanged.

- [ ] **Step 4: Verify visual wiring**

```powershell
npm run lint
npm run type-check
rg -n "#[0-9A-Fa-f]{3,8}" src/components/ChartCard.vue
```

Expected: lint/type checks pass; no component-local chart colour literal remains.

- [ ] **Step 5: Commit**

```powershell
git add src/layouts/DashboardLayout.vue src/components/ChartCard.vue
git commit -m "demo: modernize dashboard shell and chart theming"
```

### Task 3: Lead role homes with decisions, not a data wall

**Files:**

- Modify: src/pages/PortfolioPage.vue
- Modify: src/pages/MySitePage.vue
- Modify: src/pages/AnalyticsPage.vue

**Interfaces:**

- Consumes current portfolio verdict/site cards, My Site attention/zone data and analytics loss/cause computations.
- Produces existing-router drill-down actions only; no state mutation or calculation.

- [ ] **Step 1: Write display-only predicates**

```ts
const primarySite = computed(() => siteCards.value[0] ?? null)
const visiblePortfolioKpis = computed(() => portfolioKpis.value.slice(0, 4))
```

For My Site derive the first existing needsAttention item and a matching zone/reserve message. For Analytics derive top existing confirmed cause and affected site count. Do not call any store mutation.

- [ ] **Step 2: Type-check display models**

```powershell
npm run type-check
```

Expected: display models compile without changing data contracts.

- [ ] **Step 3: Compose decision heroes and bounded KPI rows**

```vue
<section class="page-hero">
  <p class="eyebrow">Приоритетное решение</p>
  <h2>{{ primarySite?.name }}</h2>
  <Button @click="router.push({ name: 'site-details', params: { siteId: primarySite?.id } })">
    Открыть объект
  </Button>
</section>
```

Portfolio shows four top decision signals. My Site begins with Operations Pulse and an existing incident/zone drill-down. Analytics begins with existing cause/loss insight; filters, charts and all evidence remain below it.

- [ ] **Step 4: Verify scope and page quality**

```powershell
npm run lint
npm run type-check
git diff --name-only -- src/data src/composables src/router
```

Expected: page checks pass; no generator, metric, role, guard or router contract changed.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/PortfolioPage.vue src/pages/MySitePage.vue src/pages/AnalyticsPage.vue
git commit -m "demo: foreground operational decisions on role homes"
```

### Task 4: Clarify the incident recovery journey

**Files:**

- Modify: src/pages/IncidentDetailsPage.vue

**Interfaces:**

- Consumes current incident action/permission/next-step values and event handlers.
- Produces a read-only recovery rail plus one existing primary next-action control; no new mutation path.

- [ ] **Step 1: Define a typed display-only recovery rail**

```ts
type RecoveryRailStep = { label: string; completed: boolean; detail: string }
const recoveryRail = computed<RecoveryRailStep[]>(() => [
  {
    label: 'Безопасность',
    completed: Boolean(incident.value?.safetyAssignedAt),
    detail: 'Координатор назначен',
  },
])
```

Complete the existing checkpoint sequence for reserve, process recovery, service and return to park.

- [ ] **Step 2: Type-check the recovery rail**

```powershell
npm run type-check
```

Expected: successful type check and no write method used by recoveryRail.

- [ ] **Step 3: Render rail and prioritise existing action**

Render semantic status-pill text before the action list. Keep current nextStep handler as the single primary Button. Retain other permitted actions as outline/secondary controls.

- [ ] **Step 4: Run domain/build checks**

```powershell
npm test
npm run lint
npm run build
```

Expected: data invariants, lint and production build pass.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/IncidentDetailsPage.vue
git commit -m "demo: clarify incident recovery journey"
```

### Task 5: Full verification and visible acceptance

**Files:**

- Modify only if evidence identifies a scoped presentation defect in a Task 1–4 file.
- Update DESIGN.md or AGENTS.md only if the final presentation rule differs from Task 1.

**Interfaces:**

- Consumes all task outputs and existing Playwright acceptance route.
- Produces verification evidence; no broadened feature scope.

- [ ] **Step 1: Run complete non-visual quality gate**

```powershell
npm run lint
npm run format:check
npm run type-check
npm test
npm run build
```

Expected: every command exits successfully.

- [ ] **Step 2: Run top-level acceptance suite**

```powershell
npx playwright test
```

Expected: the suite passes; failure blocks completion.

- [ ] **Step 3: Inspect visible desktop routes**

Start Vite on port 5180 and inspect Portfolio, My Site and INC-2026-0001. Confirm hero readability, glass only on top-level surfaces, keyboard focus on primary drill-down and recovery rail accuracy.

- [ ] **Step 4: Scope and diff review**

```powershell
git diff --check
git diff --name-only
git status --short
```

Expected: no whitespace errors; only planned presentation/docs files changed; worktree clean after final commit.

- [ ] **Step 5: Commit a verification-driven correction only if made**

```powershell
git add DESIGN.md AGENTS.md index.html src/assets/styles/style.css src/components/ui/card/Card.vue src/components/ui/button/index.ts src/components/ChartCard.vue src/layouts/DashboardLayout.vue src/pages/PortfolioPage.vue src/pages/MySitePage.vue src/pages/AnalyticsPage.vue src/pages/IncidentDetailsPage.vue
git commit -m "demo: polish executive command center presentation"
```
