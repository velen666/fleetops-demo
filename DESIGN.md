# FleetOps Demo Design System

> Inspiration source: [`../www.zima-lab.ru-DESIGN.md`](../www.zima-lab.ru-DESIGN.md).
> Этот документ — design spec демо-стенда `fleetops-demo`; он синхронизирован с дизайн-системой продукта `fleetops-frontend/DESIGN.md` (токены и правила идентичны, демо реализует ту же тему в `src/assets/styles/style.css`). Расширяет источник glassmorphism-эстетикой, dark-first подходом, 4 переключаемыми палитрами и системой градиентных токенов. Если источник и этот документ расходятся, приоритет у этого документа.

---

## 1. Визуальная тема и атмосфера

FleetOps Admin — enterprise dashboard для управления автопарком и операционного мониторинга. Эстетика **glassmorphism поверх dark-first нейтральной базы** с яркими brand/accent градиентами. Цель: технологичная, спокойная, не отвлекающая от данных поверхность, где акценты (CTA, активные статусы, hero-зоны) читаются мгновенно за счёт градиента и мягкого свечения, а контентные блоки живут на стекле (frosted glass).

**Ключевые характеристики**

- **Dark-first**: тёмная тема — основное состояние приложения, светлая — парная альтернатива.
- **Glassmorphism**: карточки и панели верхнего уровня — полупрозрачные с `backdrop-filter: blur()`, тонким gradient-border и inset-подсветкой верхнего ребра.
- **Градиенты вместо плоских акцентов**: primary CTA, hero-фон, focus ring, status glow используют градиентные токены (compose из brand/accent цветов).
- **Brand blue как якорь**: во всех 4 темах primary — `#00A0E9` (light) / `#38BDF8` (dark). Темы различаются только accent-парой, что меняет характер градиентов и не ломает бренд.
- **Контрастная типографика Montserrat**: одна семья, иерархия через size+weight.
- **Минимум визуального шума на data-dense поверхностях**: glass-лечение применяется к карточкам верхнего уровня и панели навигации, но НЕ к ячейкам таблиц, рядам списков, инлайн-элементам — там только плоские переменные. Это preserves perf (`backdrop-filter` дорогой) и читаемость.
- **4.5:1 WCAG AA** для всего текста в обоих режимах.

---

## 2. Механизм тем

### 3 уровня дизайн-токенов

```
L1 — brand raw (HEX/OKLCH константы)
     --brand-blue-500, --brand-cyan-400, --neutral-900 ...
     Никогда не переопределяются. Источник правды для цветов.

L2 — semantic shadcn tokens (алиасы)
     --primary, --accent, --card, --background, --ring ...
     Переопределяются по измерениям: data-theme и .dark
     Эти токены потребляются shadcn-vue/reka-ui компонентами и утилитами Tailwind v4.

L3 — gradient & glass tokens (compose L1/L2)
     --gradient-primary, --gradient-glow, --gradient-surface ...
     Используют color-mix(in oklch, ...) для автоматической адаптации под активную тему.
```

### Измерение 1: `data-theme` (4 значения)

| `data-theme`                      | Название     | Primary               | Accent 1              | Accent 2              | Характер                                                 |
| --------------------------------- | ------------ | --------------------- | --------------------- | --------------------- | -------------------------------------------------------- |
| `blue`                            | Brand Mono   | `#00A0E9` / `#38BDF8` | —                     | —                     | Чистый бренд. Базовый вариант.                           |
| `blue-cyan-violet` ⭐ **default** | Tech Linear  | `#00A0E9` / `#38BDF8` | `#22D3EE` / `#67E8F9` | `#7C3AED` / `#A78BFA` | Контрастный, технологичный (Linear/Vercel-вайб).         |
| `blue-teal`                       | Fleet Nature | `#00A0E9` / `#38BDF8` | `#10B981` / `#34D399` | —                     | Природный accent; визуально разделён со status-green.    |
| `blue-magenta`                    | Brand Bold   | `#00A0E9` / `#38BDF8` | `#EC4899` / `#F472B6` | —                     | Смелый, брендо-выразительный. Осторожно на data-density. |

Формат записи: `light HEX / dark HEX`.

### Измерение 2: `.dark` класс

Тёмный режим активируется классом `.dark` на `<html>`. Светлый — отсутствие класса. Применяется поверх активной `data-theme` (композиция `[data-theme="..."].dark, [data-theme="..."].dark *`).

### Состояние по умолчанию

```html
<html lang="ru" class="dark" data-theme="blue-cyan-violet"></html>
```

В `index.html` встроен inline-скрипт prevention-of-flash:

- Читает `localStorage['theme']` (`'light' | 'dark'`) и `localStorage['theme-palette']` (один из 4 ключей).
- При отсутствии значений применяет дефолт: `class="dark" data-theme="blue-cyan-violet"`.
- `prefers-color-scheme` **не используется** для auto-detection — dark default заявлен явно.

### UI switcher (out of scope текущей итерации)

Переключатель тем (dropdown в header, `useTheme()` composable, персистентность в localStorage) — отдельная задача демо-плана. Текущая итерация описывает токены и spec; переключение вручную через devtools или будущий UI.

---

## 3. Цветовая система

### 3.1. Brand raw palette (L1, theme-independent)

#### Primary brand

| Token              | Light     | Dark      | Назначение                           |
| ------------------ | --------- | --------- | ------------------------------------ |
| `--brand-blue-500` | `#00A0E9` | `#38BDF8` | Main CTA, primary interactive, links |
| `--brand-blue-600` | `#0088CC` | `#0EA5E9` | Hover state                          |
| `--brand-blue-700` | `#006BA3` | `#0284C7` | Active state                         |
| `--brand-blue-400` | `#5ABEE6` | `#7DD3FC` | Lighter primary layer                |
| `--brand-blue-450` | `#00AEEF` | `#38BDF8` | Extended brand variant               |

#### Accents (L1, используются только темами, которые их включают)

| Token                 | Light     | Dark      | Включён в темы     |
| --------------------- | --------- | --------- | ------------------ |
| `--brand-cyan-400`    | `#22D3EE` | `#67E8F9` | `blue-cyan-violet` |
| `--brand-violet-500`  | `#7C3AED` | `#A78BFA` | `blue-cyan-violet` |
| `--brand-teal-500`    | `#10B981` | `#34D399` | `blue-teal`        |
| `--brand-magenta-500` | `#EC4899` | `#F472B6` | `blue-magenta`     |

#### Neutral scale (L1, общая для всех тем, oklch)

| Token           | Light              | Dark               |
| --------------- | ------------------ | ------------------ |
| `--neutral-050` | `oklch(0.985 0 0)` | `oklch(0.145 0 0)` |
| `--neutral-100` | `oklch(0.97 0 0)`  | `oklch(0.205 0 0)` |
| `--neutral-200` | `oklch(0.922 0 0)` | `oklch(0.269 0 0)` |
| `--neutral-300` | `oklch(0.83 0 0)`  | `oklch(0.4 0 0)`   |
| `--neutral-500` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--neutral-700` | `oklch(0.32 0 0)`  | `oklch(0.768 0 0)` |
| `--neutral-900` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |

Пары light/dark — инверсные. Компоненты получают neutral-значения только через L2 алиасы (`--background`, `--card`, `--foreground` и т.д.), никогда напрямую.

#### Status colors (L1, общие для всех тем)

| Token                  | HEX                                                                      | Назначение                      |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `--status-success`     | `#27AE60`                                                                | Success / completed / online    |
| `--status-success-alt` | `#28CA41`                                                                | Lighter success                 |
| `--status-warning`     | `#FFBD2E`                                                                | Warning / attention             |
| `--status-warning-alt` | `#FCD34D`                                                                | Lighter warning                 |
| `--status-destructive` | `oklch(0.577 0.245 27.325)` (light) / `oklch(0.704 0.191 22.216)` (dark) | Error / destructive (из shadcn) |

### 3.2. Semantic tokens (L2, по темам)

Каждая тема определяет следующий набор L2 алиасов (показан default; полный перечень для каждой темы — в `src/assets/styles/style.css`):

```css
[data-theme='blue-cyan-violet'] {
  --primary: var(--brand-blue-500);
  --primary-foreground: oklch(0.985 0 0);
  --accent: var(--brand-cyan-400);
  --accent-foreground: oklch(0.145 0 0);
  --accent-2: var(--brand-violet-500); /* опциональный, есть только в violet-теме */
  --ring: var(--brand-blue-500);
  --chart-1: var(--brand-blue-500);
  --chart-2: var(--brand-cyan-400);
  --chart-3: var(--brand-violet-500);
  --chart-4: var(--brand-teal-500);
  --chart-5: var(--brand-magenta-500);
}
```

В темах без собственного accent-2 (`blue-teal`, `blue-magenta`) токен `--accent-2` явно алиасится на `var(--primary)` для согласованности каскада. Монохромная `blue` тема использует `--accent-2: var(--brand-blue-450)` (distinct brand shade, см. ниже) для визуального разнообразия графиков и hero-градиента. В `--gradient-hero` сохранён синтаксис `var(--accent-2, var(--primary))` как defensive fallback на случай удаления алиаса в будущем.

В монохромной теме `blue` без отдельного accent-цвета, `--accent` алиасится на `var(--brand-blue-400)` (lighter primary variant), чтобы `--gradient-primary` давал осмысленный blue→light-blue градиент, а не деградировал в плоский цвет. Аналогично `--chart-2..5` в `blue` теме берутся из шкалы `--brand-blue-450/400/600/700` для визуального разнообразия графиков.

Полный L2-перечень (общий каркас, общий для всех тем): `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--accent-2`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, все `--sidebar-*`, `--radius`, `--shadow-*` (см. §6.2).

### 3.3. Gradient & glass tokens (L3)

Все gradient tokens используют `color-mix(in oklch, ...)` — нативный CSS (Chrome 111+, Safari 16.2+, Firefox 113+), без препроцессоров. Благодаря compose из L1/L2 они автоматически адаптируются под активную тему.

```css
:root {
  /* Основные градиенты для CTAs и акцентных поверхностей */
  --gradient-primary: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);

  /* Радиальный glow — для подсветки под hero, primary CTAs, focus ring фона */
  --gradient-glow: radial-gradient(
    circle at 50% -20%,
    color-mix(in oklch, var(--primary) 35%, transparent) 0%,
    transparent 60%
  );

  /* Glass-поверхность карточки/панели */
  --gradient-surface: linear-gradient(
    180deg,
    color-mix(in oklch, var(--foreground) 8%, transparent) 0%,
    color-mix(in oklch, var(--foreground) 2%, transparent) 100%
  );

  /* Тонкая gradient-рамка стекла */
  --gradient-border: linear-gradient(
    180deg,
    color-mix(in oklch, var(--foreground) 12%, transparent) 0%,
    color-mix(in oklch, var(--foreground) 4%, transparent) 100%
  );

  /* Hero / app background — мягкое цветное пятно вверху */
  --gradient-hero: radial-gradient(
    120% 80% at 50% 0%,
    color-mix(in oklch, var(--accent-2, var(--primary)) 18%, var(--background)) 0%,
    var(--background) 70%
  );
}
```

### 3.4. Таблица контрастности (WCAG AA ≥ 4.5:1 для body text, ≥ 3:1 для крупного/UI)

Проверены пары primary/accent на `--background` в обоих режимах.

| Токен                                                      | Light на `--background` (`oklch(1 0 0)`)         | Dark на `--background` (`oklch(0.145 0 0)`) |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `--primary` blue-500 (`#00A0E9`)                           | 3.2:1 ⚠ (только для ≥18px/UI — не для body text) | `#38BDF8` → 9.8:1 ✅                        |
| `--primary-foreground` (`oklch(0.985 0 0)`) на `--primary` | 4.6:1 ✅                                         | 11.2:1 ✅                                   |
| `--accent` cyan (`#22D3EE`)                                | 1.8:1 ❌ (только для ≥18px/decorative)           | `#67E8F9` → 9.1:1 ✅                        |
| `--accent` teal (`#10B981`)                                | 2.6:1 ❌ (только для ≥18px/decorative)           | `#34D399` → 7.4:1 ✅                        |
| `--accent` magenta (`#EC4899`)                             | 3.4:1 ⚠ (только для ≥18px/UI)                    | `#F472B6` → 6.8:1 ✅                        |
| `--accent-2` violet (`#7C3AED`)                            | 5.4:1 ✅                                         | `#A78BFA` → 5.9:1 ✅                        |
| `--foreground` (`#1E293B` / `oklch(0.985 0 0)`)            | 14.5:1 ✅                                        | 14.5:1 ✅                                   |

**Правило:** accent-цвета (`cyan`, `teal`, `magenta`) в light-режиме не использовать для body text — только для крупного UI (≥18px), декоративных градиентов, иконок, status-индикаторов. Для текста-ссылок в light использовать `--primary` или darker variant (`--brand-blue-600`). В dark-режиме все accent-цвета пригодны для текста.

---

## 4. Типографика

### 4.1. Семейство

**Montserrat** (Google Fonts import в начале `src/assets/styles/style.css`).
Fallback stack: `Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.

В style.css:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
```

### 4.2. Иерархия (через Tailwind v4 `@theme`)

| Роль              | Размер | Вес                                   | Line height | Letter spacing | Использование                                       |
| ----------------- | ------ | ------------------------------------- | ----------- | -------------- | --------------------------------------------------- |
| Display / H1      | 48px   | 700                                   | 60px        | 0              | Hero headlines, главные заголовки страниц. ≤4 слов. |
| Heading / H2      | 40px   | 700                                   | 50px        | 0              | Секционные заголовки                                |
| Subheading / H3   | 18px   | 600                                   | 22.5px      | 0              | Заголовки карточек, подсекции                       |
| Label / H4        | 16px   | 600                                   | 20px        | 0              | Form labels, modal titles                           |
| Body              | 14px   | 500                                   | 21px        | 0              | Основной текст                                      |
| Emphasis / Metric | 18px   | 700                                   | 27px        | 0              | Метрики, числа на дашборде (`tabular-nums`)         |
| Button            | 16px   | 400 (ghost/secondary) / 600 (primary) | 24px        | 0              | Все кнопки                                          |
| Nav link          | 16px   | 400 / 600 (active)                    | 24px        | 0              | Header / nav                                        |
| Caption           | 14px   | 500                                   | 21px        | 0              | Supporting copy, metadata                           |

Tailwind v4 mapping в `@theme`:

```css
@theme {
  --font-sans: Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --text-display-size: 48px;
  --text-display--line-height: 60px;
  --text-display--font-weight: 700;
  --text-h2-size: 40px;
  --text-h2--line-height: 50px;
  --text-h2--font-weight: 700;
  --text-h3-size: 18px;
  --text-h3--line-height: 22.5px;
  --text-h3--font-weight: 600;
  --text-label-size: 16px;
  --text-label--line-height: 20px;
  --text-label--font-weight: 600;
  --text-body-size: 14px;
  --text-body--line-height: 21px;
  --text-body--font-weight: 500;
}
```

### 4.3. Числовой акцент (для метрик dashboard)

Все KPI tiles, цифровые показатели, табличные числовые колонки:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum';
```

Класс утилиты: `.tabular-nums` (Tailwind v4 включает из коробки).

### 4.4. Responsive типографика

| Брейкпоинт          | Display (H1) | H2   |
| ------------------- | ------------ | ---- |
| Desktop (≥1024px)   | 48px         | 40px |
| Tablet (768–1023px) | 36px         | 32px |
| Mobile (320–767px)  | 28px         | 26px |

Line-height сохраняет пропорции.

---

## 5. Компоненты (glass-обновление)

### 5.1. Buttons

#### Primary CTA (gradient)

```css
.btn-primary {
  background: var(--gradient-primary);
  color: var(--primary-foreground);
  font-size: 16px;
  font-weight: 600;
  padding: 16px 32px;
  border-radius: 8px;
  border: none;
  height: 54px;
  box-shadow:
    0 8px 24px color-mix(in oklch, var(--primary) 25%, transparent),
    inset 0 1px 0 color-mix(in oklch, var(--primary-foreground) 18%, transparent);
}
.btn-primary:hover {
  filter: brightness(1.08);
  cursor: pointer;
}
.btn-primary:active {
  transform: scale(0.98);
}
.btn-primary:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px color-mix(in oklch, var(--ring) 35%, transparent),
    0 8px 24px color-mix(in oklch, var(--primary) 25%, transparent);
}
```

#### Secondary Outline / Ghost / Small — без изменений из источника (секция 4.1), но:

- Border color для outline: `color-mix(in oklch, var(--primary) 60%, transparent)` вместо плоского `--primary` — лучше читается на стекле.
- Focus-visible ring одинаковый со всех кнопок: `0 0 0 3px color-mix(in oklch, var(--ring) 35%, transparent)`.

### 5.2. Cards & Containers

#### Standard Glass Card

```css
.card-glass {
  background: var(--gradient-surface);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid; /* gradient-border через border-image */
  border-image: var(--gradient-border) 1;
  border-radius: 24px;
  padding: 32px;
  box-shadow: var(--shadow-glass);
  color: var(--card-foreground);
}
.card-glass:hover {
  backdrop-filter: blur(20px) saturate(160%);
  box-shadow: var(--shadow-md), var(--shadow-glow-primary);
}
```

#### Elevated Card — как hover-состояние standard.

#### Pill / Status Badge — без правок по структуре, но фон через `color-mix(in oklch, var(--status-*) 12%, transparent)` для стеклянного эффекта.

### 5.3. Inputs

```css
.input {
  background: color-mix(in oklch, var(--background) 80%, transparent);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  height: 44px;
}
.input:focus-visible {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 22%, transparent);
  outline: none;
}
.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  color: var(--neutral-300);
}
```

### 5.4. Navigation / Header

```css
.app-header {
  background: color-mix(in oklch, var(--background) 70%, transparent);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  padding: 16px 0;
}
.app-header a.router-link-active {
  color: var(--primary);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 4px;
  font-weight: 600;
}
```

### 5.5. Status Badge / Dot — из источника секция 4 (без правок), только background через `color-mix` для стекла.

### 5.6. Hero / Page Header

```css
.app-hero {
  background: var(--gradient-hero);
  position: relative;
  overflow: hidden;
}
.app-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--gradient-glow);
  pointer-events: none;
}
```

### 5.7. Executive Command Center composition

Ролевые главные строятся по принципу **контекст → управленческое решение →
сигналы → действие → доказательства**. Верхняя зона может использовать
`.page-hero` и `Card tone="decision"`; в первом viewport допускается не более
четырёх равноправных KPI. Карточка решения называет отклонение, его масштаб и
существующий drill-down — она не создаёт новую метрику или действие.

Для единого характера поверхностей используются варианты общей `Card`:

- `tone="glass"` — только для top-level summary card;
- `tone="decision"` — одно приоритетное решение на экран;
- `tone="data"` — плотная матовая карточка с данными;
- `tone="plain"` — обычный нейтральный контейнер.

`density="compact|default|spacious"` задаёт вертикальный ритм без
переопределения базовой геометрии на странице. Первичное действие использует
градиентный вариант shadcn `Button`; его стандартная высота — 44px, плотные
toolbar-варианты могут быть меньше.

---

## 6. Layout & Elevation

### 6.1. Spacing system (без изменений из источника секция 5.1)

Base unit 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 72, 88.

### 6.2. Тени (расширение секции 6 источника)

```css
:root {
  --shadow-flat: none;
  --shadow-sm: rgba(0, 0, 0, 0.04) 0px 4px 24px 0px;
  --shadow-md: rgba(0, 0, 0, 0.08) 0px 8px 32px 0px, rgba(0, 0, 0, 0.04) 0px 2px 8px 0px;
  --shadow-lg: rgba(0, 0, 0, 0.25) 0px 25px 50px -12px;
  --shadow-glass: inset 0 1px 0 rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.32) 0px 12px 36px 0px;
  --shadow-glow-primary: 0 12px 36px color-mix(in oklch, var(--primary) 28%, transparent);
}
```

В `.dark` baseline ambient shadow усиливается: `--shadow-sm`, `--shadow-md`, `--shadow-glass` получают `rgba(0,0,0,.5)` baseline вместо `.04/.08/.32` (см. §3.3 dark адаптацию).

### 6.3. Border radius (без изменений из источника секция 5.3)

8px (buttons/inputs) / 16px (small cards) / 24px (primary cards) / 50% (avatars) / 100px (pills).

### 6.4. Grid & container (без изменений из источника секция 5.2)

Max-width 1440px, 12-column grid, 24px gaps. Card grid: 3-column desktop (368px cards), 2-column tablet, 1-column mobile. Container padding: 40px desktop → 32px tablet → 24px mobile.

### 6.5. Glassmorphism perf-ограничение

`backdrop-filter` дорогой. Glass-лечение применяется только к:

- ✅ Top-level cards на дашборде
- ✅ App header / навигация
- ✅ Modals / dialogs / popovers
- ✅ Sidebar (если есть)
- ❌ Ячейки таблиц (`<td>`)
- ❌ Ряды списков
- ❌ Inline badges / chips
- ❌ Form labels / helper text

Для data-dense поверхностей — плоский фон `var(--card)` + обычная тень `--shadow-sm`.

---

## 7. Responsive & Accessibility

### 7.1. Breakpoints (без изменений из источника секция 8.1)

| Имя           | Ширина      | Ключевые изменения                       |
| ------------- | ----------- | ---------------------------------------- |
| Mobile        | 320–767px   | 1-col cards, 24px padding, hamburger nav |
| Tablet        | 768–1023px  | 2-col cards, 32px padding                |
| Desktop       | 1024–1439px | 3-col cards (368px), 40px padding        |
| Large Desktop | 1440px+     | Max-width 1440px container               |

### 7.2. Touch targets

Minimum 44×44px для всех interactive элементов. Minimum 8px spacing между ними. Button padding минимум 12×24, для primary CTA 16×32.

### 7.3. Accessibility checklist

- [ ] Контраст ≥ 4.5:1 для body text, ≥ 3:1 для крупного/UI (см. §3.4)
- [ ] Focus-visible ring на всех interactive элементах (3px, `--ring` 35% opacity)
- [ ] Не полагаться на цвет для status — всегда иконка или текст рядом
- [ ] `prefers-reduced-motion: reduce` → disable gradient animations и transitions
- [ ] `backdrop-filter` fallback через `@supports not (backdrop-filter: blur(1px))` → solid background

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .card-glass,
  .app-header {
    background: var(--card);
  }
}
```

---

## 8. Do's and Don'ts

### Do

- **Использовать только дизайн-токены** из L1/L2/L3. Никакого хардкода HEX в компонентах.
- **Primary CTAs** — всегда `var(--gradient-primary)` (не плоский `--primary`).
- **Top-level cards** — `var(--gradient-surface)` + `backdrop-filter`.
- **Focus ring** — `0 0 0 3px color-mix(in oklch, var(--ring) 35%, transparent)`.
- **Status colors** — только через `--status-*` токены, не напрямую HEX.
- **Numeric tiles** — всегда `tabular-nums` для выравнивания разрядов.
- **Dark default**: все новые экраны сразу проверять в dark-режиме, light как парность.
- **Align to 4px grid**: spacing только из шкалы §6.1.

### Don't

- **Не хардкодить HEX** (`color: #00A0E9`) — это ломает 4 темы. Только `color: var(--primary)`.
- **Не использовать `accent-2`** в темах, где его нет (`blue-teal`, `blue-magenta`) — fallback до `var(--primary)`.
- **Не применять `backdrop-filter`** к ячейкам таблиц, рядам списков, inline-элементам — perf + читаемость.
- **Не использовать accent-цвета (cyan/teal/magenta) для body text в light-режиме** — контраст < 4.5:1 (см. §3.4).
- **Не смешивать шрифты** — только Montserrat, иерархия через size/weight.
- **Не использовать heavy shadows (`--shadow-lg`)** на обычных карточках — только на header / modals.
- **Не применять radius < 8px** к interactive элементам, **radius > 24px** к карточкам.
- **Не блокировать focus-visible** ради визуала.
- **Не ставить glass-карточку на glass-карточку** (вложенный blur) — perf-деградация и визуальный шум.
- **Не использовать `opacity` для disabled** без одновременной правки `color` на `--neutral-300`.

---

## 9. Полный перечень дизайн-токенов

См. реализацию в `src/assets/styles/style.css`. Структура блоков:

```css
/* === L1: brand raw (never override) === */
:root { --brand-blue-500: #00A0E9; --brand-cyan-400: #22D3EE; ... }

/* === L3: gradient tokens (compose L1/L2) === */
:root { --gradient-primary: linear-gradient(135deg, ...); ... }

/* === L2: semantic tokens per theme === */
[data-theme="blue"]                { --primary: var(--brand-blue-500); ... }
[data-theme="blue"] .dark          { --primary: ... ; }
[data-theme="blue-cyan-violet"]    { ... }
[data-theme="blue-cyan-violet"].dark { ... }
[data-theme="blue-teal"]           { ... }
[data-theme="blue-teal"].dark      { ... }
[data-theme="blue-magenta"]        { ... }
[data-theme="blue-magenta"].dark   { ... }

/* === Tailwind v4 mapping (не трогать) === */
@theme inline { --color-primary: var(--primary); ... }
```

Всего 8 L2-блоков переменных (4 темы × 2 режима). L1 и L3 определены один раз.

---

## 10. Браузерная поддержка и риски

### Browser matrix (минимальные версии)

| Фича                       | Chrome | Safari        | Firefox | Edge |
| -------------------------- | ------ | ------------- | ------- | ---- |
| `color-mix(in oklch, ...)` | 111+   | 16.2+         | 113+    | 111+ |
| `backdrop-filter: blur()`  | 76+    | 9+ (-webkit-) | 103+    | 79+  |
| OKLCH colors               | 111+   | 15.4+         | 113+    | 111+ |
| `border-image` с gradient  | 95+    | 15.4+         | 102+    | 95+  |

Для older браузеров — `@supports` fallback на solid backgrounds (см. §7.3).

### Известные риски

1. **Montserrat с Google Fonts** — внешний сетевой запрос. Если нужен оффлайн / self-host — отдельная карточка. Сейчас принимаем online-only с proper `display=swap`.
2. **`backdrop-filter` perf на data-dense** — ограничение применения glass только к top-level карточкам и панели навигации (см. §6.5).
3. **`color-mix` browser support** — все major браузеры с 2023. Если нужна поддержка older environments — polyfill card.
4. **4 темы × 2 режима = 8 блоков** — при добавлении новой темы руками легко забыть один из `.dark` блоков. Линтить через `grep -c "data-theme" src/assets/styles/style.css` должно быть ≥ 8.
5. **Theme switcher UI** — отсутствует в текущей итерации. Дефолтная тема выставляется в `index.html`, ручное переключение через devtools. Задача на switcher — в плане доработок демо.

---

## 11. Источники и ревизии

- Inspiration: [`../www.zima-lab.ru-DESIGN.md`](../www.zima-lab.ru-DESIGN.md) (сохранены типографика, spacing, radius, breakpoints, touch targets, semantic status colors).
- Продуктовый специфик: `../fleetops-frontend/DESIGN.md` (токены идентичны; при расхождении приоритет у продуктового файла для продуктового кода и у этого — для демо).
- Демо-конституция: [`FRONTEND_CONSTITUTION.md`](FRONTEND_CONSTITUTION.md).
- Этот документ приоритетнее источника при расхождениях.
- Ревизии design system демо фиксируются правкой этого файла с коммитом `demo: design system …`.
