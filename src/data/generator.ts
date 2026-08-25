import type {
  Incident,
  OperationalEvent,
  Downtime,
  ServiceAction,
  SourceInstance,
  RecoveryConfirmation,
  TimelineEntry,
  Robot,
  RobotStateEntry,
  Site,
  SiteZone,
  Substitution,
  CauseClassification,
  CauseVersion,
  DowntimeRule,
  IncidentStatus,
  IncidentSeverity,
  IncidentSourceKind,
  EventSource,
  EventProcessingStatus,
  CostRate,
  CostSnapshot,
  MaintenanceWork,
  FleetState,
} from '@/types/domain'

// ─── Контрольные суммы итерации ТЗ v2.0 (§10) ──────────────────────────────
// Парк: 26 роботов (17 работают / 3 резерв / 3 зарядка / 2 сервиса+авария на старте).
// Зоны: 9. Инциденты: 33, подтверждённое операционное влияние 17 ч 55 мин
// (1075 мин), потери 986 669 ₽. Арифметика по интервалам, округление до рубля
// на интервал:
//   Подольск 295 мин / 344 169 ₽ · Обухово 450 мин / 450 000 ₽ ·
//   Домодедово 330 мин / 192 500 ₽.
// Группы причин: столкновение 310 мин / 265 417 ₽ (ТЗ: 265 419 — недостижимо
// в целых минутах, задокументированное отклонение −2 ₽), палеты 210 / 207 500,
// лидар 150 / 147 500, Wi-Fi 120 / 103 750, разметка 90 / 82 500,
// батарея 75 / 65 000, привод 90 / 82 500, прочие 30 / 32 500.
// Техническая недоступность (закрытые интервалы): 49 ч 30 мин —
// Подольск 24 ч, Обухово 18 ч 30 мин, Домодедово 7 ч.
// Показатели: плановые часы 6 240 робот-ч; техническая доступность 99,21 %;
// операционная доступность мощности 99,71 % (обе — к 6 240 робот-ч, как в ТЗ).

export const CONTROL_TOTALS = {
  robots: 26,
  incidents: 33,
  zones: 9,
  sites: 3,
  confirmedImpactMinutes: 1075,
  confirmedLossRubles: 986669,
  technicalUnavailableMinutes: { 'site-pod': 1440, 'site-obh': 1110, 'site-dom': 420 },
  plannedRobotHours: 6240,
  technicalAvailabilityPct: 99.21,
  operationalAvailabilityPct: 99.71,
  startActiveIncidents: 5,
  startBacklogRobots: 4,
  startRequireAnalysis: 6,
} as const

// ─── Catalogs ──────────────────────────────────────────────────────────────

export const INCIDENT_TYPES: Record<string, { name: string; severity: IncidentSeverity }> = {
  'IT-002': { name: 'Отказ привода', severity: 'CRITICAL' },
  'IT-003': { name: 'Блокировка робота', severity: 'MEDIUM' },
  'IT-005': { name: 'Потеря связи', severity: 'HIGH' },
  'IT-006': { name: 'Проблема зарядки', severity: 'MEDIUM' },
  'IT-007': { name: 'Ошибка навигации / потеря локализации', severity: 'HIGH' },
  'IT-008': { name: 'Ошибка датчиков', severity: 'MEDIUM' },
  'IT-009': { name: 'Перегрев', severity: 'HIGH' },
  'IT-011': { name: 'Аварийная остановка', severity: 'CRITICAL' },
  'IT-012': { name: 'Сбой контроллера', severity: 'HIGH' },
  'IT-014': { name: 'Программный сбой', severity: 'MEDIUM' },
}

export const CAUSE_CATALOG: Record<string, { name: string; zone: string; detail: string }> = {
  'CA-011': {
    name: 'Деградация аккумулятора',
    zone: 'SERVICE',
    detail:
      'Снижение доступной ёмкости ниже 70% от номинала; подтверждено сравнением ёмкости, числа циклов и истории аналогичных инцидентов',
  },
  'CA-015': {
    name: 'Неисправность зарядной станции',
    zone: 'INFRASTRUCTURE',
    detail:
      'Зарядная станция не инициирует зарядку: неисправен контактный блок либо контроллер станции',
  },
  'CA-022': {
    name: 'Недоступность Wi-Fi / сетевой инфраструктуры',
    zone: 'IT',
    detail: 'Точка доступа не отвечает; робот теряет heartbeat в конкретной зоне покрытия',
  },
  'CA-023': {
    name: 'Повреждённая разметка / несоответствие карты зоне',
    zone: 'OPERATIONS',
    detail:
      'Фактическая геометрия прохода перестала соответствовать карте RMS после изменения планировки',
  },
  'CA-032': {
    name: 'Несогласованность RMS–WMS',
    zone: 'IT',
    detail: 'Статус задания расходится между RMS и WMS; подтверждено SYNC_TIMEOUT и DATA_MISMATCH',
  },
  'CA-041': {
    name: 'Столкновение / аварийное повреждение',
    zone: 'OPERATIONS',
    detail: 'Контакт с погрузчиком либо pallet-техникой; повреждение подтверждено актом и фото',
  },
  'CA-044': {
    name: 'Проезд заблокирован палетами вне зоны',
    zone: 'OPERATIONS',
    detail: 'Палеты размещены в проходе вне буферной зоны; робот не может продолжить маршрут',
  },
  'CA-045': {
    name: 'Загрязнение защитного датчика',
    zone: 'SERVICE',
    detail: 'Лидар либо защитный датчик перекрыт загрязнением; подтверждено визуальным осмотром',
  },
  'CA-046': {
    name: 'Загрязнение системы охлаждения',
    zone: 'SERVICE',
    detail: 'Вентиляционные каналы загрязнены; температура двигателя превышает норму',
  },
  'CA-047': {
    name: 'Механический износ приводного узла',
    zone: 'SERVICE',
    detail: 'Износ подшипника/редуктора подтверждён акустической и вибрационной диагностикой',
  },
  'CA-060': { name: 'Не определена', zone: 'UNKNOWN', detail: 'Диагностика не завершена' },
  'CA-062': {
    name: 'Прочее процессное нарушение',
    zone: 'OPERATIONS',
    detail: 'Единичное процессное отклонение, не отнесённое к типовым группам причин',
  },
}

export function incidentTypeLabel(code: string): string {
  const t = INCIDENT_TYPES[code]
  return t ? `${code} · ${t.name}` : code
}

export function causeLabel(code: string | null): string {
  if (!code) return '—'
  const c = CAUSE_CATALOG[code]
  return c ? `${code} · ${c.name}` : code
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function now(): Date {
  return new Date()
}
function daysAgo(n: number, hour = 10, min = 0): string {
  const d = now()
  d.setDate(d.getDate() - n)
  d.setHours(hour, min, 0, 0)
  return d.toISOString().replace('.000Z', 'Z')
}
function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString().replace('.000Z', 'Z')
}

/** Потери процесса: округление до рубля на интервал (единое правило). */
function lossForMinutes(minutes: number, ratePerHour: number): number {
  return Math.round((minutes / 60) * ratePerHour)
}

// ─── Org / Sites / Zones / Rates ───────────────────────────────────────────

const sites: Site[] = [
  {
    id: 'site-pod',
    name: 'РЦ Подольск',
    address: 'МО, Подольск',
    timezone: 'Europe/Moscow',
    ratePerHour: 70000,
    reserveNorm: 1,
  },
  {
    id: 'site-obh',
    name: 'РЦ Обухово',
    address: 'СПб, Обухово',
    timezone: 'Europe/Moscow',
    ratePerHour: 60000,
    reserveNorm: 1,
  },
  {
    id: 'site-dom',
    name: 'ФФЦ Домодедово',
    address: 'МО, Домодедово',
    timezone: 'Europe/Moscow',
    ratePerHour: 35000,
    reserveNorm: 1,
  },
]

const SITE_RATES: Record<string, number> = {
  'site-obh': 60000,
  'site-pod': 70000,
  'site-dom': 35000,
}

// Зоны объектов (ТЗ v2.0 §10.2). Канонические коды едины на всех экранах.
export const ZONES: SiteZone[] = [
  {
    id: 'z-pod-a3',
    siteId: 'site-pod',
    code: 'A-3',
    name: 'A-3 «Приёмка»',
    process: 'Приёмка',
    requiredCapacity: 2,
    responsibleName: 'Елена Смирнова',
  },
  {
    id: 'z-pod-b2',
    siteId: 'site-pod',
    code: 'B-2',
    name: 'B-2 «Хранение»',
    process: 'Перемещение',
    requiredCapacity: 2,
    responsibleName: 'Елена Смирнова',
  },
  {
    id: 'z-pod-c12',
    siteId: 'site-pod',
    code: 'C-12',
    name: 'C-12 «Пересечение маршрутов»',
    process: 'Межзонное перемещение',
    requiredCapacity: 3,
    responsibleName: 'Елена Смирнова',
  },
  {
    id: 'z-obh-a1',
    siteId: 'site-obh',
    code: 'A-1',
    name: 'A-1 «Приёмка»',
    process: 'Приёмка',
    requiredCapacity: 2,
    responsibleName: 'Павел Кузнецов',
  },
  {
    id: 'z-obh-b4',
    siteId: 'site-obh',
    code: 'B-4',
    name: 'B-4 «Хранение»',
    process: 'Перемещение',
    requiredCapacity: 2,
    responsibleName: 'Павел Кузнецов',
  },
  {
    id: 'z-obh-c7',
    siteId: 'site-obh',
    code: 'C-7',
    name: 'C-7 «Комплектация»',
    process: 'Комплектация',
    requiredCapacity: 2,
    responsibleName: 'Павел Кузнецов',
  },
  {
    id: 'z-dom-a2',
    siteId: 'site-dom',
    code: 'A-2',
    name: 'A-2 «Приёмка»',
    process: 'Приёмка',
    requiredCapacity: 2,
    responsibleName: 'Ольга Романова',
  },
  {
    id: 'z-dom-b6',
    siteId: 'site-dom',
    code: 'B-6',
    name: 'B-6 «Хранение»',
    process: 'Перемещение',
    requiredCapacity: 2,
    responsibleName: 'Ольга Романова',
  },
  {
    id: 'z-dom-c3',
    siteId: 'site-dom',
    code: 'C-3',
    name: 'C-3 «Отгрузка»',
    process: 'Отгрузка',
    requiredCapacity: 1,
    responsibleName: 'Ольга Романова',
  },
]

export function zoneNameFor(siteId: string, code: string): string {
  return (
    ZONES.find((z) => z.siteId === siteId && z.code === code)?.name ?? `${code} (зона без названия)`
  )
}

// Экземпляры источников данных по объектам (ТЗ §9): тип системы + конкретное имя.
export const SOURCE_INSTANCES: SourceInstance[] = [
  {
    id: 'src-hik-obh',
    kind: 'FLEET_MANAGEMENT',
    systemName: 'HIK RMS · Обухово',
    siteId: 'site-obh',
    vendor: 'HIK Robotics',
  },
  {
    id: 'src-fm-pod',
    kind: 'FLEET_MANAGEMENT',
    systemName: 'Fleet Manager · Подольск',
    siteId: 'site-pod',
    vendor: null,
  },
  {
    id: 'src-qrcs-dom',
    kind: 'FLEET_MANAGEMENT',
    systemName: 'Quicktron RCS · Домодедово',
    siteId: 'site-dom',
    vendor: 'Quicktron',
  },
  {
    id: 'src-wms-obh',
    kind: 'WAREHOUSE',
    systemName: 'WMS · РЦ Обухово',
    siteId: 'site-obh',
    vendor: null,
  },
  {
    id: 'src-wms-pod',
    kind: 'WAREHOUSE',
    systemName: 'WMS · РЦ Подольск',
    siteId: 'site-pod',
    vendor: null,
  },
  {
    id: 'src-wms-dom',
    kind: 'WAREHOUSE',
    systemName: 'WMS · ФФЦ Домодедово',
    siteId: 'site-dom',
    vendor: null,
  },
]

export function fleetSourceForSite(siteId: string): string {
  return (
    SOURCE_INSTANCES.find((s) => s.kind === 'FLEET_MANAGEMENT' && s.siteId === siteId)?.id ??
    'src-hik-obh'
  )
}

export function wmsSourceForSite(siteId: string): string {
  return (
    SOURCE_INSTANCES.find((s) => s.kind === 'WAREHOUSE' && s.siteId === siteId)?.id ?? 'src-wms-obh'
  )
}

// ─── Парк: 26 роботов, стартовые состояния (ТЗ v2.0 §10.1) ────────────────
// Подольск 10: FMR-001 (авария — живой INC-2026-0033), FMR-004/007 (A-3),
// FMR-008/009 (B-2), FMR-005/006 (C-12), FMR-010 (зарядка), FMR-011 (ремонт),
// FMR-012 (резерв). Нумерация с пропусками (FMR-002/003 списаны) —
// правдоподобный парк, в котором существуют и FMR-001, и FMR-012.

const ROBOT_START_STATES: Record<string, FleetState> = {
  'fmr-4': 'WORKING',
  'fmr-5': 'WORKING',
  'fmr-6': 'WORKING',
  'fmr-7': 'WORKING',
  'fmr-8': 'WORKING',
  'fmr-9': 'WORKING',
  'fmr-10': 'CHARGING',
  'fmr-11': 'IN_REPAIR',
  'fmr-12': 'RESERVE',
  'hik-1': 'WORKING',
  'hik-2': 'WORKING',
  'hik-3': 'WORKING',
  'hik-4': 'WORKING',
  'hik-5': 'WORKING',
  'hik-6': 'WORKING',
  'hik-7': 'AWAITING_REPAIR',
  'hik-8': 'CHARGING',
  'hik-9': 'RESERVE',
  'qtr-1': 'WORKING',
  'qtr-2': 'WORKING',
  'qtr-3': 'WORKING',
  'qtr-4': 'WORKING',
  'qtr-5': 'WORKING',
  'qtr-6': 'CHARGING',
  'qtr-7': 'RESERVE',
}

const ROBOT_HOME_ZONES: Record<string, string> = {
  'fmr-1': 'z-pod-c12',
  'fmr-4': 'z-pod-a3',
  'fmr-5': 'z-pod-c12',
  'fmr-6': 'z-pod-c12',
  'fmr-7': 'z-pod-a3',
  'fmr-8': 'z-pod-b2',
  'fmr-9': 'z-pod-b2',
  'fmr-10': 'z-pod-a3',
  'fmr-11': 'z-pod-c12',
  'fmr-12': 'z-pod-b2',
  'hik-1': 'z-obh-a1',
  'hik-2': 'z-obh-a1',
  'hik-3': 'z-obh-b4',
  'hik-4': 'z-obh-b4',
  'hik-5': 'z-obh-c7',
  'hik-6': 'z-obh-c7',
  'hik-7': 'z-obh-c7',
  'hik-8': 'z-obh-a1',
  'hik-9': 'z-obh-b4',
  'qtr-1': 'z-dom-a2',
  'qtr-2': 'z-dom-a2',
  'qtr-3': 'z-dom-b6',
  'qtr-4': 'z-dom-b6',
  'qtr-5': 'z-dom-c3',
  'qtr-6': 'z-dom-a2',
  'qtr-7': 'z-dom-b6',
}

function buildRobots(): Robot[] {
  const robots: Robot[] = []
  const mk = (
    id: string,
    name: string,
    model: string,
    vendor: string,
    siteId: string,
    srcId: string,
    serialPrefix: string,
  ): Robot => {
    const state: FleetState =
      id === 'fmr-1' ? 'EMERGENCY_STOP' : (ROBOT_START_STATES[id] ?? 'WORKING')
    const homeZone = ROBOT_HOME_ZONES[id] ?? null
    const zoneId =
      state === 'WORKING' || state === 'CHARGING' || state === 'ASSIGNED_REPLACE' ? homeZone : null
    const zoneName = homeZone ? (ZONES.find((z) => z.id === homeZone)?.name ?? null) : null
    const status: Robot['status'] =
      state === 'IN_REPAIR' ||
      state === 'AWAITING_REPAIR' ||
      state === 'DIAGNOSTICS' ||
      state === 'EMERGENCY_STOP' ||
      state === 'TEST_RUN'
        ? 'MAINTENANCE'
        : 'ACTIVE'
    return {
      id,
      name,
      model,
      vendor,
      siteId,
      fleetState: state,
      status,
      zoneId,
      zoneName,
      serialNumber: `${serialPrefix}-2026-${id.replace(/\D/g, '').padStart(3, '0')}`,
      sourceInstanceId: srcId,
    }
  }
  robots.push(
    mk(
      'fmr-1',
      'FMR-001',
      'FMR (класс решения; модель не подтверждена)',
      'Синтетическая демо-легенда',
      'site-pod',
      'src-fm-pod',
      'FMR',
    ),
  )
  for (let i = 4; i <= 12; i++)
    robots.push(
      mk(
        `fmr-${i}`,
        `FMR-${String(i).padStart(3, '0')}`,
        'FMR (класс решения; модель не подтверждена)',
        'Синтетическая демо-легенда',
        'site-pod',
        'src-fm-pod',
        'FMR',
      ),
    )
  for (let i = 1; i <= 9; i++)
    robots.push(
      mk(
        `hik-${i}`,
        `HIK-AMR-${String(i).padStart(3, '0')}`,
        'HIK AMR (модель не подтверждена)',
        'HIK Robotics',
        'site-obh',
        'src-hik-obh',
        'HIK',
      ),
    )
  for (let i = 1; i <= 7; i++)
    robots.push(
      mk(
        `qtr-${i}`,
        `QTR-AMR-${String(i).padStart(3, '0')}`,
        'Quicktron M60 (синтетический парк)',
        'Quicktron',
        'site-dom',
        'src-qrcs-dom',
        'QTR',
      ),
    )
  return robots
}

function buildRobotStates(): RobotStateEntry[] {
  const s: RobotStateEntry[] = []
  const push = (
    robotId: string,
    state: FleetState,
    since: string,
    source: RobotStateEntry['source'],
    comment: string | null,
  ) =>
    s.push({
      robotId,
      state,
      since,
      source,
      zoneId: ROBOT_HOME_ZONES[robotId] ?? null,
      comment,
    })
  // FMR-001: работал в C-12, сегодня 09:12 — аварийная остановка (INC-2026-0033)
  push('fmr-1', 'WORKING', daysAgo(30, 8, 0), 'RMS', null)
  push('fmr-1', 'EMERGENCY_STOP', daysAgo(0, 9, 12), 'RMS', 'Защитный бампер; INC-2026-0033')
  // FMR-011: работал в C-12, 2 дня назад — диагностика, затем ремонт (INC-2026-0028)
  push('fmr-11', 'WORKING', daysAgo(30, 8, 0), 'RMS', null)
  push(
    'fmr-11',
    'EMERGENCY_STOP',
    daysAgo(2, 11, 5),
    'RMS',
    'Превышение тока привода; INC-2026-0028',
  )
  push('fmr-11', 'DIAGNOSTICS', daysAgo(2, 12, 40), 'MANUAL', 'Диагностика приводного узла')
  push('fmr-11', 'IN_REPAIR', daysAgo(1, 9, 30), 'MANUAL', 'Замена подшипника редуктора')
  // HIK-007: деградация АКБ, ожидание запчастей (INC-2026-0026)
  push('hik-7', 'WORKING', daysAgo(30, 8, 0), 'RMS', null)
  push('hik-7', 'DIAGNOSTICS', daysAgo(3, 10, 15), 'MANUAL', 'Диагностика АКБ; INC-2026-0026')
  push('hik-7', 'AWAITING_REPAIR', daysAgo(2, 14, 0), 'MANUAL', 'Ожидание АКБ от поставщика')
  for (const id of ['fmr-10', 'hik-8', 'qtr-6'])
    push(id, 'CHARGING', daysAgo(0, 7, 30), 'RMS', null)
  for (const id of ['fmr-12', 'hik-9', 'qtr-7'])
    push(id, 'RESERVE', daysAgo(1, 8, 0), 'MANUAL', 'Готов к резерву')
  return s
}

// ─── Incident templates (ТЗ v2.0 §10.3: 33 инцидента, 1075 мин, 986 667 ₽) ─
// Раскладка выверена солвером (per-interval округление):
//   столкн: pod 25 (эталон) / obh 84+84 / dom 15+102 · палеты: obh 35+34+34+33+33 / dom 16 / pod 25
//   лидар: pod 65+15 / obh 32 / dom 15+23 · wifi: pod 45 / obh 18 / dom 15+42
//   разметка: pod 40 / obh 16 / dom 34 · батарея: pod 25 / obh 16 / dom 34
//   привод: pod 40 / obh 16 / dom 34 · прочие: pod 15 / obh 15.

interface T {
  type: string
  title: string
  desc: string
  siteId: string
  robotId: string
  zoneCode: string
  status: IncidentStatus
  source: IncidentSourceKind
  causeCode: string | null
  maturity: Incident['causeMaturity']
  causeComment?: string
  /** Подтверждённые минуты операционного влияния (0 — влияния нет). */
  impactMin: number
  /** Статус подтверждения интервала влияния. */
  dtStatus: Downtime['confirmationStatus']
  /** Закрытые минуты технической недоступности (0 — не было). */
  techMin: number
  /** Открытая техническая недоступность на старте. */
  techOpen?: boolean
  actions: Array<{ type: string; name: string; result: ServiceAction['result']; comment?: string }>
  recovery: boolean
  daysAgo: number
  hour: number
  coordinator: string | null
  slaReactionMin: number | null
  slaRecoveryMin: number | null
}

const templates: T[] = [
  // ══ Столкновения (6 / 310 мин / 265 417 ₽; ТЗ: 265 419 — недостижимо, −2 ₽) ══
  // Эталонный сквозной кейс ТЗ v2.0 §6: FMR-001 ← FMR-012, зона C-12.
  {
    type: 'IT-011',
    title: 'Столкновение FMR-001 со складской техникой в зоне C-12; повреждён правый привод',
    desc: 'Пересечение маршрутов C-12. Сработал защитный бампер, ток правого привода выше порога. WMS зафиксировал срыв задания M-2847. Резерв FMR-012 введён через 25 минут, процесс восстановлен; FMR-001 прошёл ремонт и контрольный запуск.',
    siteId: 'site-pod',
    robotId: 'fmr-1',
    zoneCode: 'C-12',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment:
      'Контакт с погрузчиком в зоне C-12. Повреждён правый приводной узел. Акт №А-142 и фото приложены оператором.',
    impactMin: 25,
    dtStatus: 'CONFIRMED',
    techMin: 508,
    actions: [
      {
        type: 'SECURE',
        name: 'Оградить место, зафиксировать акт и фото',
        result: 'SUCCESS',
        comment: 'Акт №А-142, фото повреждения',
      },
      {
        type: 'SUBSTITUTION',
        name: 'Назначить резерв FMR-012 в зону C-12',
        result: 'SUCCESS',
        comment: 'Резерв введён за 25 минут',
      },
      {
        type: 'DIAGNOSTICS',
        name: 'Диагностика правого привода',
        result: 'SUCCESS',
        comment: 'Повреждён приводной модуль, замена обязательна',
      },
      {
        type: 'REPAIR',
        name: 'Замена правого приводного модуля',
        result: 'SUCCESS',
        comment: 'Модуль заменён, крепёж затянут моментом',
      },
      {
        type: 'TEST_RUN',
        name: 'Контрольный маршрут с грузом по зоне C-12',
        result: 'SUCCESS',
        comment: 'Маршрут пройден без ошибок',
      },
      {
        type: 'ORGANIZATION',
        name: 'Разделение потоков роботов и погрузчиков в C-12',
        result: 'SUCCESS',
        comment: 'Ограждение установлено, регламент обновлён',
      },
    ],
    recovery: true,
    daysAgo: 3,
    hour: 9,
    coordinator: 'Иван Петров',
    slaReactionMin: 3,
    slaRecoveryMin: 508,
  },
  {
    type: 'IT-011',
    title: 'Столкновение HIK-AMR-002 с погрузчиком на выезде из зоны A-1',
    desc: 'Погрузчик выполнял разгрузку вне размеченной зоны. Резерв HIK-AMR-009 введён через 84 минуты.',
    siteId: 'site-obh',
    robotId: 'hik-2',
    zoneCode: 'A-1',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment: 'Погрузчик двигался задним ходом без наблюдателя. Повреждён бампер и датчик.',
    impactMin: 84,
    dtStatus: 'CONFIRMED',
    techMin: 300,
    actions: [
      { type: 'SECURE', name: 'Оградить место, зафиксировать акт', result: 'SUCCESS' },
      { type: 'SUBSTITUTION', name: 'Назначить резерв HIK-AMR-009', result: 'SUCCESS' },
      { type: 'REPAIR', name: 'Замена датчика бампера', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 26,
    hour: 11,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 6,
    slaRecoveryMin: 300,
  },
  {
    type: 'IT-011',
    title: 'Столкновение HIK-AMR-005 с тележкой в зоне C-7',
    desc: 'Тележка оставлена на маршруте комплектации. Резерв HIK-AMR-009 введён через 84 минуты.',
    siteId: 'site-obh',
    robotId: 'hik-5',
    zoneCode: 'C-7',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment: 'Тележка без маркировки в проходе. Повреждено крыло корпуса.',
    impactMin: 84,
    dtStatus: 'CONFIRMED',
    techMin: 300,
    actions: [
      { type: 'SECURE', name: 'Оградить место', result: 'SUCCESS' },
      { type: 'SUBSTITUTION', name: 'Назначить резерв HIK-AMR-009', result: 'SUCCESS' },
      { type: 'REPAIR', name: 'Ремонт крыла корпуса', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 21,
    hour: 13,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 5,
    slaRecoveryMin: 300,
  },
  {
    type: 'IT-011',
    title: 'Столкновение QTR-AMR-002 с палетным погрузчиком в зоне A-2',
    desc: 'Пиковая приёмка, погрузчик срезал угол. Резерв QTR-AMR-007 введён быстро, за 15 минут.',
    siteId: 'site-dom',
    robotId: 'qtr-2',
    zoneCode: 'A-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment: 'Нарушение регламента движения в смешанной зоне приёмки.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 40,
    actions: [
      { type: 'SECURE', name: 'Оградить место', result: 'SUCCESS' },
      { type: 'SUBSTITUTION', name: 'Назначить резерв QTR-AMR-007', result: 'SUCCESS' },
      { type: 'REPAIR', name: 'Ремонт корпуса', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 17,
    hour: 10,
    coordinator: 'Ольга Романова',
    slaReactionMin: 4,
    slaRecoveryMin: 40,
  },
  {
    type: 'IT-011',
    title: 'Столкновение QTR-AMR-004 со складской тележкой в зоне B-6',
    desc: 'Серьёзное повреждение переднего модуля; эвакуация и ввод резерва заняли 102 минуты.',
    siteId: 'site-dom',
    robotId: 'qtr-4',
    zoneCode: 'B-6',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment:
      'Ограниченный обзор в месте пересечения потоков; тележка выехала из стеллажного прохода.',
    impactMin: 102,
    dtStatus: 'CONFIRMED',
    techMin: 190,
    actions: [
      { type: 'SECURE', name: 'Оградить место, эвакуировать робот', result: 'SUCCESS' },
      {
        type: 'SUBSTITUTION',
        name: 'Назначить резерв QTR-AMR-007',
        result: 'SUCCESS',
        comment: 'Резерв введён после эвакуации',
      },
      { type: 'REPAIR', name: 'Ремонт переднего модуля', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 12,
    hour: 15,
    coordinator: 'Ольга Романова',
    slaReactionMin: 7,
    slaRecoveryMin: 280,
  },
  // ══ Палеты вне зоны (7 / 210 мин / 207 500 ₽) ══
  {
    type: 'IT-003',
    title: 'Проезд HIK-AMR-001 заблокирован палетами в зоне A-1',
    desc: 'Палеты размещены вне буферной зоны при разгрузке фуры. Робот ожидал освобождения проезда.',
    siteId: 'site-obh',
    robotId: 'hik-1',
    zoneCode: 'A-1',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Палеты в проходе A-1 вне буферной зоны. Фото оператора приложено.',
    impactMin: 35,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [
      {
        type: 'ORGANIZATION',
        name: 'Освободить проезд, вернуть палеты в буфер',
        result: 'SUCCESS',
      },
    ],
    recovery: true,
    daysAgo: 25,
    hour: 9,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 5,
    slaRecoveryMin: 35,
  },
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-003 палетами в зоне B-4',
    desc: 'Ночная смена оставила палеты в транспортном коридоре.',
    siteId: 'site-obh',
    robotId: 'hik-3',
    zoneCode: 'B-4',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Повторяющееся нарушение складской дисциплины ночной смены.',
    impactMin: 34,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Освободить коридор', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 20,
    hour: 6,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 4,
    slaRecoveryMin: 34,
  },
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-004 палетами у стеллажа B-4',
    desc: 'Палеты выставлены за габарит размеченной зоны.',
    siteId: 'site-obh',
    robotId: 'hik-4',
    zoneCode: 'B-4',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Выставление палет за габарит; повтор третий за месяц.',
    impactMin: 34,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Освободить проезд', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 14,
    hour: 8,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 3,
    slaRecoveryMin: 34,
  },
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-006 палетами в зоне C-7',
    desc: 'Комплектация: палеты в проходе отбора.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zoneCode: 'C-7',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Проход отбора использован как временное хранение.',
    impactMin: 33,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Освободить проход', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 9,
    hour: 12,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 6,
    slaRecoveryMin: 33,
  },
  // Пятый случай кластера палет в Обухово — без координатора (живая очередь).
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-002 палетами в зоне A-1 (повтор)',
    desc: 'Утренняя приёмка: палеты снова вне буферной зоны. Инцидент ожидает назначения координатора.',
    siteId: 'site-obh',
    robotId: 'hik-2',
    zoneCode: 'A-1',
    status: 'IN_PROGRESS',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'PRIMARY',
    impactMin: 33,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Освободить проезд', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 2,
    hour: 8,
    coordinator: null,
    slaReactionMin: null,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-003',
    title: 'Проезд QTR-AMR-001 заблокирован палетой в зоне A-2',
    desc: 'Единичный случай на Домодедово: палета отставлена в сторону прохода.',
    siteId: 'site-dom',
    robotId: 'qtr-1',
    zoneCode: 'A-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Единичное отклонение, оперативно устранено.',
    impactMin: 16,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Убрать палету', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 8,
    hour: 10,
    coordinator: 'Ольга Романова',
    slaReactionMin: 3,
    slaRecoveryMin: 16,
  },
  {
    type: 'IT-003',
    title: 'Проезд FMR-007 заблокирован палетами в зоне A-3',
    desc: 'Разгрузка вне графика: палеты в проезде приёмки.',
    siteId: 'site-pod',
    robotId: 'fmr-7',
    zoneCode: 'A-3',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment: 'Водитель электропогрузчика разместил палеты вне размеченной зоны.',
    impactMin: 25,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'ORGANIZATION', name: 'Освободить проезд', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 5,
    hour: 14,
    coordinator: 'Иван Петров',
    slaReactionMin: 4,
    slaRecoveryMin: 25,
  },
  // ══ Загрязнение лидара (5 / 150 мин / 147 500 ₽) ══
  {
    type: 'IT-008',
    title: 'Загрязнение лидара FMR-008 в зоне B-2',
    desc: 'Пыль от картонной тары перекрыла сканирующий слой. Полная очистка с калибровкой заняла больше часа.',
    siteId: 'site-pod',
    robotId: 'fmr-8',
    zoneCode: 'B-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment:
      'Лидар перекрыт пылью от тары; осмотр подтверждает. Рекомендован регламент очистки.',
    impactMin: 65,
    dtStatus: 'CONFIRMED',
    techMin: 150,
    actions: [
      { type: 'DIAGNOSTICS', name: 'Осмотр датчика', result: 'SUCCESS' },
      {
        type: 'REPAIR',
        name: 'Очистка лидара с калибровкой',
        result: 'SUCCESS',
        comment: 'Очистка выполнена на месте',
      },
    ],
    recovery: true,
    daysAgo: 23,
    hour: 10,
    coordinator: 'Иван Петров',
    slaReactionMin: 5,
    slaRecoveryMin: 150,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара FMR-009 в зоне B-2 (повтор)',
    desc: 'Повторный случай в той же зоне; быстрая очистка силами смены.',
    siteId: 'site-pod',
    robotId: 'fmr-9',
    zoneCode: 'B-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment: 'Тот же механизм: пыль от тары. Создана плановая работа ТОиР на регламент.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 150,
    actions: [
      { type: 'REPAIR', name: 'Очистка лидара', result: 'SUCCESS' },
      {
        type: 'ORGANIZATION',
        name: 'Плановая работа: регламент очистки датчиков',
        result: 'SUCCESS',
      },
    ],
    recovery: true,
    daysAgo: 16,
    hour: 11,
    coordinator: 'Иван Петров',
    slaReactionMin: 4,
    slaRecoveryMin: 150,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара HIK-AMR-003 в зоне B-4',
    desc: 'Короткая остановка; датчик очищен на месте.',
    siteId: 'site-obh',
    robotId: 'hik-3',
    zoneCode: 'B-4',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment: 'Загрязнение защитного датчика; осмотр подтверждает.',
    impactMin: 32,
    dtStatus: 'CONFIRMED',
    techMin: 120,
    actions: [{ type: 'REPAIR', name: 'Очистка датчика', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 11,
    hour: 9,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 5,
    slaRecoveryMin: 120,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара QTR-AMR-003 в зоне B-6',
    desc: 'Плёнка от упаковки на линзе.',
    siteId: 'site-dom',
    robotId: 'qtr-3',
    zoneCode: 'B-6',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment: 'Плёнка от упаковки; механическая блокировка сканера.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Очистка линзы', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 7,
    hour: 13,
    coordinator: 'Ольга Романова',
    slaReactionMin: 4,
    slaRecoveryMin: 15,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара QTR-AMR-005 в зоне C-3',
    desc: 'Остановка у рампы отгрузки; пыль от напольных работ.',
    siteId: 'site-dom',
    robotId: 'qtr-5',
    zoneCode: 'C-3',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment: 'Пыль у рампы; осмотр подтверждает.',
    impactMin: 23,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Очистка датчика', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 4,
    hour: 16,
    coordinator: 'Ольга Романова',
    slaReactionMin: 5,
    slaRecoveryMin: 23,
  },
  // ══ Недоступность Wi-Fi / сети (4 / 120 мин / 103 750 ₽) ══
  {
    type: 'IT-005',
    title: 'Потеря связи FMR-005 в зоне B-2 (точка AP-17)',
    desc: 'Роуминг между точками доступа; робот потерял heartbeat на 45 минут.',
    siteId: 'site-pod',
    robotId: 'fmr-5',
    zoneCode: 'B-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    causeComment: 'Точка AP-17 не отвечала; подтверждено мониторингом сети и логами контроллера.',
    impactMin: 45,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [
      { type: 'DIAGNOSTICS', name: 'Диагностика точки AP-17', result: 'SUCCESS' },
      { type: 'REPAIR', name: 'Перезагрузка и замена кабеля точки', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 24,
    hour: 15,
    coordinator: 'Иван Петров',
    slaReactionMin: 9,
    slaRecoveryMin: 45,
  },
  {
    type: 'IT-005',
    title: 'Потеря связи HIK-AMR-001 в зоне A-1 (роуминг)',
    desc: 'Короткая потеря роуминга между AP-3 и AP-4.',
    siteId: 'site-obh',
    robotId: 'hik-1',
    zoneCode: 'A-1',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    causeComment: 'Некорректная конфигурация роуминга; исправлена ИТ-отделом.',
    impactMin: 18,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Коррекция конфигурации роуминга', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 13,
    hour: 10,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 6,
    slaRecoveryMin: 18,
  },
  {
    type: 'IT-005',
    title: 'Недоступность сети QTR-AMR-002 в зоне A-2',
    desc: 'Короткий отказ сегмента; задание ожидало восстановления связи.',
    siteId: 'site-dom',
    robotId: 'qtr-2',
    zoneCode: 'A-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    causeComment: 'Сбой порта коммутатора; подтверждено ИТ-мониторингом.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Переключение на резервный порт', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 10,
    hour: 9,
    coordinator: 'Ольга Романова',
    slaReactionMin: 5,
    slaRecoveryMin: 15,
  },
  // Без финальной причины (живая очередь «требует разбора»).
  {
    type: 'IT-005',
    title: 'Потеря связи QTR-AMR-004 в зоне B-6 (диагностика продолжается)',
    desc: 'Повторное падение heartbeat; ИТ-отдел проверяет зону покрытия.',
    siteId: 'site-dom',
    robotId: 'qtr-4',
    zoneCode: 'B-6',
    status: 'IN_PROGRESS',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'PRIMARY',
    impactMin: 42,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'DIAGNOSTICS', name: 'Диагностика зоны покрытия B-6', result: null }],
    recovery: true,
    daysAgo: 1,
    hour: 11,
    coordinator: 'Ольга Романова',
    slaReactionMin: 7,
    slaRecoveryMin: null,
  },
  // ══ Разметка / навигационная инфраструктура (3 / 90 мин / 82 500 ₽) ══
  {
    type: 'IT-007',
    title: 'Потеря локализации FMR-008 в зоне A-3 после перепланировки',
    desc: 'Геометрия прохода изменилась, карта не соответствовала факту.',
    siteId: 'site-pod',
    robotId: 'fmr-8',
    zoneCode: 'A-3',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment: 'Разметка не обновлена после перемещения стеллажа; карта актуализирована.',
    impactMin: 40,
    dtStatus: 'CONFIRMED',
    techMin: 240,
    actions: [
      { type: 'DIAGNOSTICS', name: 'Сверка карты с фактом', result: 'SUCCESS' },
      { type: 'REPAIR', name: 'Обновление карты зоны A-3', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 18,
    hour: 8,
    coordinator: 'Иван Петров',
    slaReactionMin: 6,
    slaRecoveryMin: 240,
  },
  {
    type: 'IT-007',
    title: 'Потеря локализации HIK-AMR-006 в зоне B-4 (повреждена разметка)',
    desc: 'Разметка стёрта в месте ричстак-потока.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zoneCode: 'B-4',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment: 'Разметка восстановлена; подтверждено контрольным маршрутом.',
    impactMin: 16,
    dtStatus: 'CONFIRMED',
    techMin: 200,
    actions: [{ type: 'REPAIR', name: 'Восстановление разметки', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 15,
    hour: 7,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 5,
    slaRecoveryMin: 200,
  },
  {
    type: 'IT-007',
    title: 'Несоответствие карты QTR-AMR-001 в зоне A-2',
    desc: 'Временная конструкция у рампы не была отражена на карте.',
    siteId: 'site-dom',
    robotId: 'qtr-1',
    zoneCode: 'A-2',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment: 'Карта обновлена после демонтажа конструкции.',
    impactMin: 34,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Обновление карты зоны', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 6,
    hour: 12,
    coordinator: 'Ольга Романова',
    slaReactionMin: 4,
    slaRecoveryMin: 34,
  },
  // ══ Батарея / зарядка (3 / 75 мин / 65 000 ₽) ══
  {
    type: 'IT-006',
    title: 'Критический разряд АКБ FMR-006 в зоне C-12',
    desc: 'Ёмкость ниже 70%: робот не дошёл до станции, задание прервано.',
    siteId: 'site-pod',
    robotId: 'fmr-6',
    zoneCode: 'C-12',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-011',
    maturity: 'FINAL',
    causeComment: 'Деградация АКБ подтверждена числом циклов и замером ёмкости.',
    impactMin: 25,
    dtStatus: 'CONFIRMED',
    techMin: 192,
    actions: [
      {
        type: 'REPAIR',
        name: 'Замена АКБ',
        result: 'SUCCESS',
        comment: 'АКБ заменена, цикл проверен',
      },
    ],
    recovery: true,
    daysAgo: 19,
    hour: 17,
    coordinator: 'Иван Петров',
    slaReactionMin: 5,
    slaRecoveryMin: 192,
  },
  // Ожидание возврата робота: HIK-AMR-007 в ожидании запчастей (живой бэклог).
  {
    type: 'IT-006',
    title: 'Деградация АКБ HIK-AMR-007 (ожидание запчасти)',
    desc: 'Ёмкость 58%. Робот выведен из работы, АКБ в пути от поставщика. Процесс восстановлен перераспределением заданий.',
    siteId: 'site-obh',
    robotId: 'hik-7',
    zoneCode: 'C-7',
    status: 'IN_PROGRESS',
    source: 'AUTOMATIC',
    causeCode: 'CA-011',
    maturity: 'FINAL',
    causeComment: 'Ёмкость ниже порога; подтверждено диагностикой. Ожидается новая АКБ.',
    impactMin: 16,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    techOpen: true,
    actions: [
      { type: 'DIAGNOSTICS', name: 'Диагностика АКБ', result: 'SUCCESS' },
      {
        type: 'REPAIR',
        name: 'Замена АКБ',
        result: null,
        comment: 'Ожидание запчасти от поставщика',
      },
    ],
    recovery: true,
    daysAgo: 3,
    hour: 10,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 6,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-006',
    title: 'Ошибка зарядки QTR-AMR-003 на станции SK-1',
    desc: 'Контактный блок станции не инициировал зарядку.',
    siteId: 'site-dom',
    robotId: 'qtr-3',
    zoneCode: 'B-6',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-011',
    maturity: 'FINAL',
    causeComment: 'Износ контактного блока станции; блок заменён.',
    impactMin: 34,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [{ type: 'REPAIR', name: 'Замена контактного блока SK-1', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 22,
    hour: 6,
    coordinator: 'Ольга Романова',
    slaReactionMin: 7,
    slaRecoveryMin: 15,
  },
  // ══ Привод / контроллер (3 / 90 мин / 82 500 ₽) ══
  // Процесс восстановлен, сервис продолжается: FMR-011 в ремонте (живой бэклог).
  {
    type: 'IT-002',
    title: 'Отказ приводного узла FMR-011 в зоне C-12',
    desc: 'Превышение тока и рассинхрон колёс. Резерв не назначался: мощность зоны восстановлена перенаправлением потока заданий. FMR-011 в ремонте.',
    siteId: 'site-pod',
    robotId: 'fmr-11',
    zoneCode: 'C-12',
    status: 'IN_PROGRESS',
    source: 'AUTOMATIC',
    causeCode: 'CA-047',
    maturity: 'REFINED',
    causeComment: 'Износ подшипника редуктора правого привода; подтверждён вибродиагностикой.',
    impactMin: 40,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    techOpen: true,
    actions: [
      { type: 'DIAGNOSTICS', name: 'Вибродиагностика привода', result: 'SUCCESS' },
      {
        type: 'REPAIR',
        name: 'Замена подшипника редуктора',
        result: null,
        comment: 'Работа в процессе',
      },
    ],
    recovery: true,
    daysAgo: 2,
    hour: 11,
    coordinator: 'Иван Петров',
    slaReactionMin: 5,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-002',
    title: 'Отказ левого привода HIK-AMR-005 в зоне C-7',
    desc: 'Рассинхрон оборотов; привод заменён в тот же день.',
    siteId: 'site-obh',
    robotId: 'hik-5',
    zoneCode: 'C-7',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-047',
    maturity: 'FINAL',
    causeComment: 'Износ шестерни редуктора; подтверждён разборкой.',
    impactMin: 16,
    dtStatus: 'CONFIRMED',
    techMin: 190,
    actions: [{ type: 'REPAIR', name: 'Замена редуктора', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 28,
    hour: 9,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 8,
    slaRecoveryMin: 190,
  },
  {
    type: 'IT-002',
    title: 'Отказ привода QTR-AMR-005 в зоне C-3',
    desc: 'Перегрев и отказ правого привода у рампы.',
    siteId: 'site-dom',
    robotId: 'qtr-5',
    zoneCode: 'C-3',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-047',
    maturity: 'FINAL',
    causeComment: 'Износ подшипника; заменён узел в сборе.',
    impactMin: 34,
    dtStatus: 'CONFIRMED',
    techMin: 190,
    actions: [{ type: 'REPAIR', name: 'Замена приводного узла', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 27,
    hour: 14,
    coordinator: 'Ольга Романова',
    slaReactionMin: 6,
    slaRecoveryMin: 190,
  },
  // ══ Прочие процессные (2 / 30 мин / 32 500 ₽) ══
  {
    type: 'IT-014',
    title: 'Программный сбой контроллера FMR-004 в зоне A-3',
    desc: 'Перезагрузка контроллера во время задания; задание перезапущено.',
    siteId: 'site-pod',
    robotId: 'fmr-4',
    zoneCode: 'A-3',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-062',
    maturity: 'FINAL',
    causeComment: 'Единичный сбой прошивки v4.8; повтор не зафиксирован.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 200,
    actions: [{ type: 'REPAIR', name: 'Откат профиля движения', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 27,
    hour: 16,
    coordinator: 'Иван Петров',
    slaReactionMin: 4,
    slaRecoveryMin: 200,
  },
  // Готов к закрытию: все подтверждения получены, ожидает закрытия координатором.
  {
    type: 'IT-014',
    title: 'Программный сбой контроллера HIK-AMR-006 (готов к закрытию)',
    desc: 'Повторный сбой прошивки устранён обновлением профиля; контрольный маршрут пройден.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zoneCode: 'C-7',
    status: 'READY_TO_CLOSE',
    source: 'AUTOMATIC',
    causeCode: 'CA-062',
    maturity: 'FINAL',
    causeComment: 'Обновление профиля движения; подтверждено контрольным маршрутом.',
    impactMin: 15,
    dtStatus: 'CONFIRMED',
    techMin: 0,
    actions: [
      { type: 'REPAIR', name: 'Обновление профиля контроллера', result: 'SUCCESS' },
      { type: 'TEST_RUN', name: 'Контрольный маршрут', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 1,
    hour: 13,
    coordinator: 'Павел Кузнецов',
    slaReactionMin: 5,
    slaRecoveryMin: 15,
  },
  // ══ Живой сбрасываемый рабочий инцидент (INC-2026-0033) ══
  // Повторная авария FMR-001 в C-12: усиливает сюжет системной проблемы зоны.
  // Открытое операционное влияние НЕ входит в контрольные суммы до завершения.
  {
    type: 'IT-011',
    title: 'Столкновение FMR-001 со складской техникой в зоне C-12 (рабочий инцидент)',
    desc: 'Повторный контакт на пересечении маршрутов: сработал защитный бампер, ток правого привода выше порога, задание M-3101 прервано. Требуется обеспечить безопасность, назначить резерв и восстановить мощность зоны.',
    siteId: 'site-pod',
    robotId: 'fmr-1',
    zoneCode: 'C-12',
    status: 'OPEN',
    source: 'AUTOMATIC',
    causeCode: null,
    maturity: 'NONE',
    impactMin: 0,
    dtStatus: 'PROPOSED',
    techMin: 0,
    techOpen: true,
    actions: [],
    recovery: false,
    daysAgo: 0,
    hour: 9,
    coordinator: null,
    slaReactionMin: null,
    slaRecoveryMin: null,
  },
]

const DOWNTIME_KIND_BY_CAUSE: Record<string, Downtime['kind']> = {
  'CA-041': 'ACCIDENT_SAFETY',
  'CA-044': 'ORGANIZATIONAL',
  'CA-022': 'INFRASTRUCTURE',
  'CA-023': 'INFRASTRUCTURE',
  'CA-032': 'INFRASTRUCTURE',
  'CA-011': 'UNPLANNED_TECHNICAL',
  'CA-045': 'UNPLANNED_TECHNICAL',
  'CA-047': 'UNPLANNED_TECHNICAL',
  'CA-062': 'UNPLANNED_TECHNICAL',
}

// ─── Generate ───────────────────────────────────────────────────────────────

export function generateDemoData() {
  const robots = buildRobots()
  const robotStates = buildRobotStates()
  const incs: Incident[] = []
  const evts: OperationalEvent[] = []
  const dts: Downtime[] = []
  const acts: ServiceAction[] = []
  const recs: RecoveryConfirmation[] = []
  const tl: TimelineEntry[] = []
  const causes: CauseClassification[] = []
  const maints: MaintenanceWork[] = []
  const subs: Substitution[] = []
  let evtC = 0,
    actC = 0,
    tlC = 0,
    dtC = 0

  templates.forEach((t, idx) => {
    const incId = `inc-${String(idx + 1).padStart(3, '0')}`
    const num = `INC-${now().getFullYear()}-${String(idx + 1).padStart(4, '0')}`
    const zone = zoneNameFor(t.siteId, t.zoneCode)
    // Эталонный кейс и живой рабочий — точные метки ТЗ §6 (09:12/09:13).
    const isReference = idx === 0
    const isLive = t.status === 'OPEN'
    const detected =
      isReference || isLive
        ? daysAgo(t.daysAgo, 9, 12)
        : daysAgo(t.daysAgo, t.hour, (idx * 13) % 60)
    const opened = isReference || isLive ? daysAgo(t.daysAgo, 9, 13) : plusMinutes(detected, 2)
    const severity = INCIDENT_TYPES[t.type]?.severity ?? 'MEDIUM'
    const rate = SITE_RATES[t.siteId] ?? 50000

    const dtStart = detected
    const impactConfirmed = t.dtStatus === 'CONFIRMED' && t.impactMin > 0
    const dtSeconds = impactConfirmed ? t.impactMin * 60 : 0
    const dtEnd = impactConfirmed && t.status !== 'OPEN' ? plusMinutes(dtStart, t.impactMin) : null
    const loss = impactConfirmed ? lossForMinutes(t.impactMin, rate) : 0
    const closedAt = t.status === 'CLOSED' ? daysAgo(Math.max(0, t.daysAgo - 1), 15, 0) : null

    incs.push({
      id: incId,
      incidentNumber: num,
      title: t.title,
      description: t.desc,
      siteId: t.siteId,
      zoneName: zone,
      robotId: t.robotId,
      incidentTypeCode: t.type,
      status: t.status,
      severity,
      sourceKind: t.source,
      detectedAt: detected,
      openedAt: opened,
      closedAt,
      coordinatorId: t.coordinator ? 'u-002' : null,
      coordinatorName: t.coordinator,
      causeCode: t.causeCode,
      causeMaturity: t.maturity,
      hasDowntime: t.impactMin > 0 || t.dtStatus === 'PROPOSED',
      downtimeConfirmed: impactConfirmed,
      recoveryConfirmed: t.recovery,
      downtimeSeconds: dtSeconds,
      lossRubles: loss,
      reactionSlaSeconds: t.slaReactionMin ? t.slaReactionMin * 60 : null,
      reactionSlaMet: t.slaReactionMin ? t.slaReactionMin <= 10 : null,
      recoverySlaSeconds: t.slaRecoveryMin ? t.slaRecoveryMin * 60 : null,
      recoverySlaMet: t.slaRecoveryMin ? t.slaRecoveryMin <= 120 : null,
    })

    // Events
    if (t.source === 'AUTOMATIC') {
      const raws = withHuman(rawEventsFor(t.type, t.robotId, t.zoneCode))
      raws.forEach((re, e) => {
        evtC++
        const time = isReference || isLive ? plusMinutes(detected, e) : plusMinutes(detected, e * 2)
        evts.push({
          id: `evt-${String(evtC).padStart(4, '0')}`,
          timestamp: time,
          receivedAt: time,
          source: re.src as EventSource,
          sourceInstanceId:
            re.src === 'WMS' ? wmsSourceForSite(t.siteId) : fleetSourceForSite(t.siteId),
          siteId: t.siteId,
          robotId: t.robotId,
          rawCode: re.code,
          rawMessage: re.msg,
          humanInterpretation: re.human,
          rawPayload: re.payload,
          normalizedType: INCIDENT_TYPES[t.type]?.name ?? t.type,
          incidentTypeCode: t.type,
          processingStatus: e === 0 ? 'INCIDENT_CREATED' : 'LINKED_TO_INCIDENT',
          incidentId: incId,
          ruleApplied: `RULE-${t.type}-${t.siteId.split('-')[1].toUpperCase()}`,
          confidence: 0.85 + e * 0.05,
          isDuplicate: false,
        })
      })
    }

    // Операционное влияние (интервал 1): потери процесса.
    if (t.impactMin > 0 || t.dtStatus === 'PROPOSED') {
      dtC++
      dts.push({
        id: `dt-${String(dtC).padStart(3, '0')}`,
        incidentId: incId,
        siteId: t.siteId,
        robotId: t.robotId,
        zoneName: zone,
        intervalType: 'OPERATIONAL_IMPACT',
        downtimeType: 'FULL',
        confirmationStatus: t.dtStatus,
        confirmedBy: impactConfirmed ? (t.coordinator ?? 'Иван Петров') : null,
        confirmedAt: impactConfirmed ? (dtEnd ?? dtStart) : null,
        kind: DOWNTIME_KIND_BY_CAUSE[t.causeCode ?? ''] ?? 'UNPLANNED_TECHNICAL',
        impactObject: 'ZONE',
        impact: {
          backupRobotId: null,
          compensation: impactConfirmed ? 'PARTIAL' : 'NONE',
          adjustmentBasis: isReference
            ? 'Мощность зоны восстановлена резервом FMR-012'
            : 'Мощность зоны восстановлена перенаправлением потока заданий',
        },
        intervalState: dtEnd ? 'CLOSED' : isLive ? 'OPEN' : 'CLOSED',
        startedAt: dtStart,
        endedAt: dtEnd,
        calendarDurationSeconds: dtSeconds,
        accountableDurationSeconds: dtSeconds,
        ruleCode: 'RULE_SYS_CALENDAR_24X7',
        ruleName: 'Календарь 24×7',
        fallbackApplied: false,
        ratePerHour: rate,
        lossRubles: loss,
      })
    }

    // Техническая недоступность (интервал 2): доступность актива, без потерь.
    if (t.techMin > 0 || t.techOpen) {
      dtC++
      const techSeconds = t.techMin * 60
      const techEnd = t.techMin > 0 ? plusMinutes(dtStart, t.techMin) : null
      dts.push({
        id: `dt-${String(dtC).padStart(3, '0')}`,
        incidentId: incId,
        siteId: t.siteId,
        robotId: t.robotId,
        zoneName: zone,
        intervalType: 'TECHNICAL_UNAVAILABLE',
        downtimeType: 'FULL',
        confirmationStatus: t.techOpen ? 'PENDING_CONFIRMATION' : 'CONFIRMED',
        confirmedBy: t.techOpen ? null : (t.coordinator ?? 'Иван Петров'),
        confirmedAt: t.techOpen ? null : techEnd,
        kind: DOWNTIME_KIND_BY_CAUSE[t.causeCode ?? ''] ?? 'UNPLANNED_TECHNICAL',
        impactObject: 'ROBOT',
        impact: { backupRobotId: null, compensation: 'NONE', adjustmentBasis: null },
        intervalState: techEnd ? 'CLOSED' : 'OPEN',
        startedAt: dtStart,
        endedAt: techEnd,
        calendarDurationSeconds: techSeconds,
        accountableDurationSeconds: techSeconds,
        ruleCode: 'RULE_TECH_UNAVAILABLE',
        ruleName: 'Техническая недоступность актива',
        fallbackApplied: false,
        ratePerHour: 0,
        lossRubles: 0,
      })
    }

    // Cause chain
    if (t.causeCode && t.maturity !== 'NONE') {
      const chain: CauseVersion[] = [
        {
          sequence: 1,
          causeCode: 'CA-060',
          causeName: 'Не определена',
          maturity: 'PRIMARY',
          classifiedBy: 'Система',
          classifiedAt: opened,
          comment: 'Первичная регистрация',
          responsibilityZone: 'UNKNOWN',
          evidence: [],
        },
      ]
      if (t.maturity === 'REFINED' || t.maturity === 'FINAL') {
        chain.push({
          sequence: 2,
          causeCode: t.causeCode,
          causeName: CAUSE_CATALOG[t.causeCode]?.name ?? t.causeCode,
          maturity: 'REFINED',
          classifiedBy: 'Сергей Иванов',
          classifiedAt: plusMinutes(opened, 45),
          comment:
            t.causeComment ??
            CAUSE_CATALOG[t.causeCode]?.detail ??
            'Причина установлена по результатам разбора: осмотр, диагностика и контрольный маршрут',
          responsibilityZone: CAUSE_CATALOG[t.causeCode]?.zone ?? 'UNKNOWN',
          evidence: ['Логи системы', 'Осмотр', 'Диагностика'],
        })
      }
      if (t.maturity === 'FINAL') {
        chain.push({
          sequence: 3,
          causeCode: t.causeCode,
          causeName: CAUSE_CATALOG[t.causeCode]?.name ?? t.causeCode,
          maturity: 'FINAL',
          classifiedBy: t.coordinator ?? 'Иван Петров',
          classifiedAt: closedAt ?? plusMinutes(opened, 120),
          comment:
            t.causeComment ??
            CAUSE_CATALOG[t.causeCode]?.detail ??
            'Причина установлена по результатам разбора: осмотр, диагностика и контрольный маршрут',
          responsibilityZone: CAUSE_CATALOG[t.causeCode]?.zone ?? 'UNKNOWN',
          evidence: ['Логи системы', 'Осмотр', 'Диагностика', 'Акт/фото'],
        })
      }
      causes.push({ incidentId: incId, currentMaturity: t.maturity, versions: chain })
    }

    // Actions
    t.actions.forEach((a) => {
      actC++
      acts.push({
        id: `act-${String(actC).padStart(4, '0')}`,
        incidentId: incId,
        actionTypeCode: a.type,
        actionTypeName: a.name,
        description: a.comment ?? a.name,
        status: a.result ? 'COMPLETED' : 'IN_PROGRESS',
        result: a.result,
        executorName: a.result ? 'Сергей Иванов' : null,
        createdAt: plusMinutes(opened, 30),
        startedAt: a.result ? plusMinutes(opened, 45) : null,
        completedAt: a.result ? plusMinutes(opened, 90) : null,
        comment: a.comment ?? null,
      })
    })

    // Recovery
    if (t.recovery) {
      recs.push({
        incidentId: incId,
        recoveredAt: dtEnd ?? closedAt ?? plusMinutes(opened, 120),
        confirmedBy: t.coordinator ?? 'Елена Смирнова',
        basis: 'SUCCESSFUL_ACTION',
        actionId: acts.length > 0 ? acts[acts.length - 1].id : null,
        comment: 'Восстановление подтверждено',
      })
    }

    // ─── Замещения (эталонный кейс + исторические) ───
    if (isReference) {
      subs.push({
        id: 'sub-0001',
        incidentId: incId,
        siteId: 'site-pod',
        zoneId: 'z-pod-c12',
        damagedRobotId: 'fmr-1',
        backupRobotId: 'fmr-12',
        originalTask: 'M-2847',
        newTask: 'M-2847 (продолжение резервом)',
        requestedAt: daysAgo(3, 9, 18),
        assignedAt: daysAgo(3, 9, 22),
        engagedAt: daysAgo(3, 9, 37),
        processRestoredAt: daysAgo(3, 9, 37),
        confirmedBy: 'Елена Смирнова',
        authorName: 'Елена Смирнова',
      })
    }
    if (idx === 1) {
      subs.push({
        id: 'sub-0002',
        incidentId: incId,
        siteId: 'site-obh',
        zoneId: 'z-obh-a1',
        damagedRobotId: 'hik-2',
        backupRobotId: 'hik-9',
        originalTask: 'M-4102',
        newTask: 'M-4102 (продолжение резервом)',
        requestedAt: daysAgo(26, 11, 20),
        assignedAt: daysAgo(26, 11, 30),
        engagedAt: daysAgo(26, 12, 24),
        processRestoredAt: daysAgo(26, 12, 24),
        confirmedBy: 'Павел Кузнецов',
        authorName: 'Павел Кузнецов',
      })
    }
    if (idx === 3) {
      subs.push({
        id: 'sub-0003',
        incidentId: incId,
        siteId: 'site-dom',
        zoneId: 'z-dom-a2',
        damagedRobotId: 'qtr-2',
        backupRobotId: 'qtr-7',
        originalTask: 'M-5207',
        newTask: 'M-5207 (продолжение резервом)',
        requestedAt: daysAgo(17, 10, 15),
        assignedAt: daysAgo(17, 10, 25),
        engagedAt: daysAgo(17, 11, 9),
        processRestoredAt: daysAgo(17, 11, 9),
        confirmedBy: 'Ольга Романова',
        authorName: 'Ольга Романова',
      })
    }

    // ─── Единая история ───
    tlC++
    tl.push({
      id: `tl-${tlC}`,
      incidentId: incId,
      timestamp: detected,
      eventType: 'EVENT',
      summary: `Событие: ${t.type} (${t.source === 'AUTOMATIC' ? 'авто' : 'ручной ввод'})`,
      actorName: t.source === 'AUTOMATIC' ? 'FleetOps' : 'Елена Смирнова',
      isAutomatic: t.source === 'AUTOMATIC',
      details: null,
    })
    tlC++
    tl.push({
      id: `tl-${tlC}`,
      incidentId: incId,
      timestamp: opened,
      eventType: 'CREATED',
      summary: `Инцидент ${num} создан`,
      actorName: t.source === 'AUTOMATIC' ? 'FleetOps (корреляция)' : 'Елена Смирнова (оператор)',
      isAutomatic: t.source === 'AUTOMATIC',
      details: null,
    })
    if (t.coordinator) {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: plusMinutes(opened, 2),
        eventType: 'ASSIGNED',
        summary: `Назначен координатор: ${t.coordinator}`,
        actorName: t.coordinator,
        isAutomatic: false,
        details: null,
      })
    }
    if (isReference) {
      // Точные шаги сквозного сценария ТЗ v2.0 §6.
      const ref: Array<[number, number, number, string, string, boolean]> = [
        [3, 9, 15, 'Инцидент принят; подтверждено столкновение', 'Иван Петров', false],
        [
          3,
          9,
          18,
          'Зона C-12 ограждена; FMR-001 выведен с критического пути',
          'Елена Смирнова',
          false,
        ],
        [3, 9, 22, 'Резерв FMR-012 выбран и назначен в зону C-12', 'Елена Смирнова', false],
        [
          3,
          9,
          37,
          'Резерв FMR-012 принял задание; мощность зоны восстановлена (операционное влияние: 25 минут)',
          'WMS · РЦ Подольск',
          true,
        ],
        [
          3,
          10,
          5,
          'Диагностика: повреждение приводного узла; аварийный ремонт',
          'Сергей Иванов',
          false,
        ],
        [3, 17, 25, 'Ремонт и контрольный запуск завершены', 'Сергей Иванов', false],
        [
          3,
          17,
          40,
          'FMR-001 возвращён в парк; техническая недоступность: 8 ч 28 мин',
          'Иван Петров',
          false,
        ],
      ]
      for (const [d, h, m, summary, actor, auto] of ref) {
        tlC++
        tl.push({
          id: `tl-${tlC}`,
          incidentId: incId,
          timestamp: daysAgo(d, h, m),
          eventType: 'SCENARIO',
          summary,
          actorName: actor,
          isAutomatic: auto,
          details: null,
        })
      }
    }
    if (t.maturity === 'REFINED' || t.maturity === 'FINAL') {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: plusMinutes(opened, 45),
        eventType: 'CAUSE',
        summary: `Причина уточнена: ${causeLabel(t.causeCode)}`,
        actorName: 'Сергей Иванов (инженер)',
        isAutomatic: false,
        details: null,
      })
    }
    if (t.maturity === 'FINAL') {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: closedAt ?? plusMinutes(opened, 120),
        eventType: 'CAUSE',
        summary: `Причина подтверждена: ${causeLabel(t.causeCode)}`,
        actorName: `${t.coordinator ?? 'Иван Петров'} (руководитель)`,
        isAutomatic: false,
        details: null,
      })
    }
    if (impactConfirmed) {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: dtEnd ?? plusMinutes(opened, 120),
        eventType: 'DOWNTIME',
        summary: `Операционное влияние подтверждено: ${Math.round((t.impactMin / 60) * 100) / 100} ч × ${rate.toLocaleString('ru-RU')} ₽/ч = ${loss.toLocaleString('ru-RU')} ₽`,
        actorName: t.coordinator ?? 'Иван Петров',
        isAutomatic: false,
        details: null,
      })
    }
    if (t.techMin > 0) {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: plusMinutes(dtStart, t.techMin),
        eventType: 'DOWNTIME',
        summary: `Робот возвращён в парк; техническая недоступность закрыта: ${Math.floor(t.techMin / 60)} ч ${t.techMin % 60} мин`,
        actorName: t.coordinator ?? 'Иван Петров',
        isAutomatic: false,
        details: null,
      })
    }
    if (t.recovery) {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: dtEnd ?? closedAt ?? plusMinutes(opened, 120),
        eventType: 'RECOVERY',
        summary: 'Восстановление подтверждено',
        actorName: t.coordinator ?? 'Елена Смирнова',
        isAutomatic: false,
        details: null,
      })
    }
    if (t.status === 'CLOSED') {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: closedAt!,
        eventType: 'CLOSED',
        summary: 'Инцидент закрыт',
        actorName: t.coordinator ?? 'Иван Петров',
        isAutomatic: false,
        details: null,
      })
    }
  })

  // Background events
  const bgCodes = [
    'TEMP_WARNING',
    'TASK_COMPLETE',
    'BATTERY_FULL',
    'POSITION_UPDATE',
    'CHARGING_STARTED',
    'PATH_RECALCULATED',
  ]
  for (let i = 0; i < 80; i++) {
    evtC++
    const robot = robots[i % robots.length]
    const code =
      i % 3 === 2
        ? i % 2 === 0
          ? 'TASK_NOT_STARTED'
          : 'TASK_NOT_ASSIGNED'
        : bgCodes[i % bgCodes.length]
    const status: EventProcessingStatus =
      i % 6 === 0 ? 'NEEDS_CLASSIFICATION' : i % 9 === 0 ? 'DUPLICATE_REJECTED' : 'INFORMATIONAL'
    evts.push({
      id: `evt-${String(evtC).padStart(4, '0')}`,
      timestamp: daysAgo(i % 28, 6 + (i % 14), (i * 7) % 60),
      receivedAt: daysAgo(i % 28, 6 + (i % 14), (i * 7 + 2) % 60),
      source: i % 3 === 2 ? 'WMS' : 'RMS',
      sourceInstanceId:
        i % 3 === 2 ? wmsSourceForSite(robot.siteId) : fleetSourceForSite(robot.siteId),
      siteId: robot.siteId,
      robotId: robot.id,
      rawCode: code,
      rawMessage: `${code}: routine event from ${robot.name}`,
      rawPayload: {
        robotId: robot.name,
        zone: `Z-${(i % 5) + 1}`,
        level: 'INFO',
        missionId: `M-${1000 + i}`,
      },
      humanInterpretation:
        EVENT_HUMAN_RU[code] ?? 'Регулярный технический сигнал системы управления парком',
      normalizedType: 'Информационное событие',
      incidentTypeCode: null,
      processingStatus: status,
      incidentId: null,
      ruleApplied: null,
      confidence: 0.3,
      isDuplicate: status === 'DUPLICATE_REJECTED',
    })
  }

  // Cost rates
  const costRates: CostRate[] = sites.map((s, i) => ({
    id: `rate-${i + 1}`,
    siteId: s.id,
    siteName: s.name,
    ratePerHour: SITE_RATES[s.id],
    effectiveFrom: daysAgo(90),
    effectiveTo: null,
    currency: 'RUB',
    basis: 'Договор на техническое обслуживание',
    version: 1,
  }))

  const costSnapshots: CostSnapshot[] = dts
    .filter(
      (d) =>
        d.intervalType === 'OPERATIONAL_IMPACT' &&
        d.confirmationStatus === 'CONFIRMED' &&
        d.accountableDurationSeconds > 0,
    )
    .map((d) => {
      const hours = d.accountableDurationSeconds / 3600
      return {
        downtimeId: d.id,
        incidentId: d.incidentId,
        rateId: costRates.find((r) => r.siteId === d.siteId)?.id ?? '',
        hours,
        ratePerHour: d.ratePerHour,
        totalRubles: d.lossRubles,
        currency: 'RUB',
        formula: `${hours.toFixed(2)} ч × ${d.ratePerHour.toLocaleString('ru-RU')} ₽/ч`,
        calculatedAt: d.endedAt ?? daysAgo(1),
      }
    })

  const downtimeRules: DowntimeRule[] = [
    {
      id: 'rule-sys',
      code: 'RULE_SYS_CALENDAR_24X7',
      displayName: 'Календарь 24×7',
      status: 'PUBLISHED',
      timeAccountingMode: 'CALENDAR_24X7',
      scopeSiteId: null,
      scopeIncidentTypeCode: null,
      priority: 0,
      effectiveFrom: daysAgo(365),
      effectiveTo: null,
    },
    {
      id: 'rule-tech',
      code: 'RULE_TECH_UNAVAILABLE',
      displayName: 'Техническая недоступность актива',
      status: 'PUBLISHED',
      timeAccountingMode: 'CALENDAR_24X7',
      scopeSiteId: null,
      scopeIncidentTypeCode: null,
      priority: 10,
      effectiveFrom: daysAgo(365),
      effectiveTo: null,
    },
  ]

  // ─── Сервисный бэклог / ТОиР (ТЗ v2.0 §8.6: ≥8 работ; старт — 4 робота) ──
  const inc = (n: number) => `inc-${String(n).padStart(3, '0')}`
  maints.push(
    // Активный бэклог (4 робота): FMR-001 (диагностика, новый), FMR-011 (в ремонте),
    // HIK-AMR-007 (ожидает запчасти), QTR-AMR-003 (плановое ТО).
    {
      id: 'mnt-001',
      type: 'DIAGNOSTIC',
      title: 'Диагностика правого привода FMR-001',
      problem: 'Столкновение в C-12; подозрение на повреждение приводного узла',
      robotId: 'fmr-1',
      siteId: 'site-pod',
      incidentId: inc(33),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(0, 12, 0),
      startedAt: null,
      completedAt: null,
      status: 'ASSIGNED',
      result: null,
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 0,
      partsCost: 0,
      externalCost: 0,
    },
    {
      id: 'mnt-002',
      type: 'EMERGENCY',
      title: 'Замена подшипника редуктора FMR-011',
      problem: 'Износ подшипника правого привода (вибродиагностика)',
      robotId: 'fmr-11',
      siteId: 'site-pod',
      incidentId: inc(28),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(-1, 17, 0),
      startedAt: daysAgo(1, 9, 30),
      completedAt: null,
      status: 'IN_PROGRESS',
      result: null,
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 0,
      partsCost: 0,
      externalCost: 0,
    },
    {
      id: 'mnt-003',
      type: 'EMERGENCY',
      title: 'Замена АКБ HIK-AMR-007',
      problem: 'Ёмкость 58%, ниже порога 70%',
      robotId: 'hik-7',
      siteId: 'site-obh',
      incidentId: inc(26),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(-2, 12, 0),
      startedAt: null,
      completedAt: null,
      status: 'WAITING_PARTS',
      result: null,
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 0,
      partsCost: 0,
      externalCost: 0,
    },
    {
      id: 'mnt-004',
      type: 'PLANNED',
      title: 'Плановое ТО: QTR-AMR-003 (цикл 500 ч)',
      problem: null,
      robotId: 'qtr-3',
      siteId: 'site-dom',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(-3, 10, 0),
      startedAt: null,
      completedAt: null,
      status: 'PLANNED',
      result: null,
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 0,
      partsCost: 0,
      externalCost: 0,
    },
    // Завершённые работы (история + стоимость ремонта).
    {
      id: 'mnt-005',
      type: 'EMERGENCY',
      title: 'Аварийный ремонт: замена правого привода FMR-001',
      problem: 'Повреждён приводной модуль после столкновения',
      robotId: 'fmr-1',
      siteId: 'site-pod',
      incidentId: inc(1),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(2, 17, 0),
      startedAt: daysAgo(3, 10, 5),
      completedAt: daysAgo(3, 17, 25),
      status: 'RESULT_CONFIRMED',
      result: 'Привод заменён, контрольный маршрут пройден',
      testRunPassed: true,
      returnedToParkAt: daysAgo(3, 17, 40),
      laborCost: 18000,
      partsCost: 96000,
      externalCost: 0,
    },
    {
      id: 'mnt-006',
      type: 'CORRECTIVE',
      title: 'Обновление карты зоны A-3',
      problem: 'Геометрия прохода не соответствовала карте',
      robotId: 'fmr-8',
      siteId: 'site-pod',
      incidentId: inc(22),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(17, 12, 0),
      startedAt: daysAgo(18, 9, 0),
      completedAt: daysAgo(18, 12, 0),
      status: 'RESULT_CONFIRMED',
      result: 'Карта актуализирована',
      testRunPassed: true,
      returnedToParkAt: daysAgo(18, 12, 0),
      laborCost: 7200,
      partsCost: 0,
      externalCost: 0,
    },
    {
      id: 'mnt-007',
      type: 'CORRECTIVE',
      title: 'Очистка лидара FMR-008',
      problem: 'Пыль от картонной тары на сканирующем слое',
      robotId: 'fmr-8',
      siteId: 'site-pod',
      incidentId: inc(13),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(22, 12, 0),
      startedAt: daysAgo(23, 10, 30),
      completedAt: daysAgo(23, 12, 0),
      status: 'RESULT_CONFIRMED',
      result: 'Лидар очищен',
      testRunPassed: true,
      returnedToParkAt: daysAgo(23, 12, 0),
      laborCost: 3600,
      partsCost: 0,
      externalCost: 0,
    },
    {
      id: 'mnt-008',
      type: 'CORRECTIVE',
      title: 'Очистка лидара FMR-009 + регламент',
      problem: 'Повторное загрязнение в зоне B-2',
      robotId: 'fmr-9',
      siteId: 'site-pod',
      incidentId: inc(14),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(15, 12, 0),
      startedAt: daysAgo(16, 11, 30),
      completedAt: daysAgo(16, 13, 0),
      status: 'RESULT_CONFIRMED',
      result: 'Очистка выполнена; введён регламент осмотра',
      testRunPassed: true,
      returnedToParkAt: daysAgo(16, 13, 0),
      laborCost: 5400,
      partsCost: 1200,
      externalCost: 0,
    },
    {
      id: 'mnt-009',
      type: 'EMERGENCY',
      title: 'Замена АКБ FMR-006',
      problem: 'Ёмкость ниже 70%',
      robotId: 'fmr-6',
      siteId: 'site-pod',
      incidentId: inc(25),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(18, 12, 0),
      startedAt: daysAgo(19, 17, 30),
      completedAt: daysAgo(19, 20, 0),
      status: 'RESULT_CONFIRMED',
      result: 'АКБ заменена, цикл проверен',
      testRunPassed: true,
      returnedToParkAt: daysAgo(19, 20, 0),
      laborCost: 6000,
      partsCost: 84000,
      externalCost: 0,
    },
    {
      id: 'mnt-010',
      type: 'CORRECTIVE',
      title: 'Диагностика и ремонт Wi-Fi точки AP-17',
      problem: 'Потеря heartbeat в зоне B-2',
      robotId: 'fmr-5',
      siteId: 'site-pod',
      incidentId: inc(18),
      executor: 'ИТ-отдел',
      dueAt: daysAgo(23, 18, 0),
      startedAt: daysAgo(24, 15, 30),
      completedAt: daysAgo(24, 18, 0),
      status: 'RESULT_CONFIRMED',
      result: 'Точка перезагружена, кабель заменён',
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 4800,
      partsCost: 3500,
      externalCost: 0,
    },
    {
      id: 'mnt-011',
      type: 'EMERGENCY',
      title: 'Замена редуктора HIK-AMR-005',
      problem: 'Износ шестерни левого привода',
      robotId: 'hik-5',
      siteId: 'site-obh',
      incidentId: inc(29),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(27, 12, 0),
      startedAt: daysAgo(28, 9, 30),
      completedAt: daysAgo(28, 12, 15),
      status: 'RESULT_CONFIRMED',
      result: 'Редуктор заменён',
      testRunPassed: true,
      returnedToParkAt: daysAgo(28, 12, 15),
      laborCost: 14400,
      partsCost: 58000,
      externalCost: 0,
    },
    {
      id: 'mnt-012',
      type: 'CORRECTIVE',
      title: 'Ремонт зарядной станции SK-1',
      problem: 'Неисправен контактный блок',
      robotId: 'qtr-3',
      siteId: 'site-dom',
      incidentId: inc(27),
      executor: 'Дмитрий Волков',
      dueAt: daysAgo(21, 12, 0),
      startedAt: daysAgo(22, 6, 30),
      completedAt: daysAgo(22, 8, 0),
      status: 'RESULT_CONFIRMED',
      result: 'Контактный блок заменён',
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 4200,
      partsCost: 15500,
      externalCost: 0,
    },
    {
      id: 'mnt-013',
      type: 'PLANNED',
      title: 'Плановое ТО: FMR-004 (цикл 500 ч)',
      problem: null,
      robotId: 'fmr-4',
      siteId: 'site-pod',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(5, 12, 0),
      startedAt: daysAgo(5, 9, 0),
      completedAt: daysAgo(5, 11, 0),
      status: 'RESULT_CONFIRMED',
      result: 'ТО выполнено по регламенту',
      testRunPassed: true,
      returnedToParkAt: daysAgo(5, 11, 0),
      laborCost: 5400,
      partsCost: 2800,
      externalCost: 0,
    },
    {
      id: 'mnt-014',
      type: 'PLANNED',
      title: 'Плановое ТО: HIK-AMR-001 (цикл 500 ч)',
      problem: null,
      robotId: 'hik-1',
      siteId: 'site-obh',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(9, 12, 0),
      startedAt: daysAgo(9, 9, 0),
      completedAt: daysAgo(9, 11, 30),
      status: 'RESULT_CONFIRMED',
      result: 'ТО выполнено по регламенту',
      testRunPassed: true,
      returnedToParkAt: daysAgo(9, 11, 30),
      laborCost: 5400,
      partsCost: 2200,
      externalCost: 0,
    },
    {
      id: 'mnt-015',
      type: 'CORRECTIVE',
      title: 'Восстановление разметки B-4',
      problem: 'Разметка стёрта в месте ричстак-потока',
      robotId: 'hik-6',
      siteId: 'site-obh',
      incidentId: inc(23),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(14, 12, 0),
      startedAt: daysAgo(15, 7, 30),
      completedAt: daysAgo(15, 10, 35),
      status: 'RESULT_CONFIRMED',
      result: 'Разметка восстановлена',
      testRunPassed: true,
      returnedToParkAt: daysAgo(15, 10, 35),
      laborCost: 3000,
      partsCost: 1800,
      externalCost: 0,
    },
    {
      id: 'mnt-016',
      type: 'CORRECTIVE',
      title: 'Ремонт корпуса HIK-AMR-002 после столкновения',
      problem: 'Повреждён бампер и датчик',
      robotId: 'hik-2',
      siteId: 'site-obh',
      incidentId: inc(2),
      executor: 'Сергей Иванов',
      dueAt: daysAgo(25, 17, 0),
      startedAt: daysAgo(26, 12, 30),
      completedAt: daysAgo(26, 16, 10),
      status: 'RESULT_CONFIRMED',
      result: 'Бампер и датчик заменены',
      testRunPassed: true,
      returnedToParkAt: daysAgo(26, 16, 10),
      laborCost: 12000,
      partsCost: 41000,
      externalCost: 0,
    },
    {
      id: 'mnt-017',
      type: 'CORRECTIVE',
      title: 'Замена приводного узла QTR-AMR-005',
      problem: 'Износ подшипника правого привода',
      robotId: 'qtr-5',
      siteId: 'site-dom',
      incidentId: inc(30),
      executor: 'Дмитрий Волков',
      dueAt: daysAgo(26, 17, 0),
      startedAt: daysAgo(27, 14, 30),
      completedAt: daysAgo(27, 17, 44),
      status: 'RESULT_CONFIRMED',
      result: 'Узел заменён',
      testRunPassed: true,
      returnedToParkAt: daysAgo(27, 17, 44),
      laborCost: 9600,
      partsCost: 33000,
      externalCost: 0,
    },
  )

  return {
    incidents: incs,
    events: evts,
    downtimes: dts,
    serviceActions: acts,
    recoveryConfirmations: recs,
    timeline: tl,
    causeClassifications: causes,
    robots,
    robotStates,
    sites,
    zones: ZONES,
    substitutions: subs,
    downtimeRules,
    costRates,
    costSnapshots,
    maintenance: maints,
  }
}

// ─── Raw events per type (ТЗ §9: правдоподобные коды) ────────────────────

const EVENT_HUMAN_RU: Record<string, string> = {
  SAFETY_BUMPER_TRIGGERED: 'Сработал защитный бампер — аварийная остановка',
  RIGHT_DRIVE_OVERCURRENT: 'Ток правого привода выше порога — защитное отключение',
  WHEEL_SPEED_MISMATCH: 'Рассинхрон оборотов колёс',
  PATH_BLOCKED: 'Проезд заблокирован препятствием',
  MISSION_PAUSED: 'Задание приостановлено',
  TASK_NOT_COMPLETED: 'Задание не завершено в срок (процессный факт WMS)',
  TASK_NOT_STARTED: 'Задание не начато (процессный факт WMS)',
  COMM_LOST: 'Потеря связи с роботом',
  HEARTBEAT_TIMEOUT: 'Таймаут heartbeat',
  BATTERY_LOW: 'Низкий заряд аккумулятора',
  CHARGING_FAILED: 'Ошибка зарядки на станции',
  NAVIGATION_LOST: 'Потеря локализации',
  TASK_INTERRUPTED: 'Задание прервано',
  SYNC_TIMEOUT: 'Таймаут синхронизации RMS–WMS',
  DATA_MISMATCH: 'Расхождение статусов RMS и WMS',
  MOTOR_OVERHEAT: 'Перегрев двигателя',
  LIDAR_QUALITY_DEGRADED: 'Качество сканирования лидара снижено',
}

function withHuman<R extends { src: string; code: string; msg: string }>(
  events: R[],
): Array<R & { human: string }> {
  return events.map((e) => ({
    ...e,
    human: EVENT_HUMAN_RU[e.code] ?? 'Технический сигнал системы управления парком',
  }))
}

function rawEventsFor(
  type: string,
  robotId: string,
  zone: string,
): Array<{ src: string; code: string; msg: string; payload: Record<string, unknown> }> {
  const name = robotId.startsWith('hik')
    ? robotId.replace('hik-', 'HIK-AMR-')
    : robotId.startsWith('fmr')
      ? robotId.replace('fmr-', 'FMR-')
      : robotId.replace('qtr-', 'QTR-AMR-')
  switch (type) {
    case 'IT-011':
      return [
        {
          src: 'RMS',
          code: 'SAFETY_BUMPER_TRIGGERED',
          msg: `Robot ${name}: safety bumper triggered. Emergency stop engaged. Zone ${zone}.`,
          payload: {
            robotId: name,
            zone,
            sensor: 'BUMPER',
            severity: 'CRITICAL',
            missionId: 'M-2847',
          },
        },
        {
          src: 'RMS',
          code: 'RIGHT_DRIVE_OVERCURRENT',
          msg: `Robot ${name}: right drive motor current 18.2A exceeds threshold 15A.`,
          payload: {
            robotId: name,
            current: 18.2,
            threshold: 15,
            drive: 'RIGHT',
            severity: 'ERROR',
            missionId: 'M-2847',
          },
        },
        {
          src: 'WMS',
          code: 'TASK_NOT_COMPLETED',
          msg: `WMS: task M-2847 not completed by ${name}. Route unfinished.`,
          payload: { robotId: name, taskId: 'M-2847', status: 'NOT_COMPLETED', severity: 'WARN' },
        },
      ]
    case 'IT-003':
      return [
        {
          src: 'RMS',
          code: 'PATH_BLOCKED',
          msg: `Robot ${name} cannot proceed: obstacle detected in zone ${zone}.`,
          payload: {
            robotId: name,
            zone,
            obstacleType: 'PALLET',
            severity: 'WARN',
            missionId: 'M-3011',
          },
        },
        {
          src: 'RMS',
          code: 'MISSION_PAUSED',
          msg: `Mission paused for ${name}: path blocked by obstacle.`,
          payload: { robotId: name, reason: 'OBSTACLE', missionId: 'M-3011', severity: 'INFO' },
        },
        {
          src: 'WMS',
          code: 'TASK_NOT_COMPLETED',
          msg: `WMS: task M-3011 not completed by ${name}.`,
          payload: { robotId: name, taskId: 'M-3011', status: 'NOT_COMPLETED', severity: 'WARN' },
        },
      ]
    case 'IT-005':
      return [
        {
          src: 'RMS',
          code: 'COMM_LOST',
          msg: `Communication lost with ${name}. No heartbeat for 900s. Zone ${zone}.`,
          payload: { robotId: name, zone, lastSeen: '900s', severity: 'CRITICAL', ap: 'AP-17' },
        },
        {
          src: 'RMS',
          code: 'HEARTBEAT_TIMEOUT',
          msg: `Heartbeat timeout for ${name} in zone ${zone}. AP-17 unreachable.`,
          payload: { robotId: name, zone, timeout: '900s', ap: 'AP-17', severity: 'ERROR' },
        },
      ]
    case 'IT-006':
      return [
        {
          src: 'RMS',
          code: 'BATTERY_LOW',
          msg: `Robot ${name} battery at 8%. Critical threshold reached.`,
          payload: {
            robotId: name,
            batteryLevel: 8,
            capacity: '62%',
            cycles: 830,
            severity: 'ERROR',
          },
        },
        {
          src: 'RMS',
          code: 'CHARGING_FAILED',
          msg: `Charging failed for ${name} at station. Contact block error.`,
          payload: {
            robotId: name,
            stationId: 'SK-03',
            errorCode: 'CHG_CONTACT_FAIL',
            severity: 'WARN',
          },
        },
      ]
    case 'IT-007':
      return [
        {
          src: 'RMS',
          code: 'NAVIGATION_LOST',
          msg: `Robot ${name} reported navigation lost in zone ${zone}. Localization confidence below threshold.`,
          payload: {
            robotId: name,
            zone,
            confidence: 0.12,
            missionId: 'M-2847',
            severity: 'ERROR',
          },
        },
        {
          src: 'RMS',
          code: 'TASK_INTERRUPTED',
          msg: `Mission M-2847 interrupted for ${name}: navigation timeout exceeded 30s.`,
          payload: {
            robotId: name,
            missionId: 'M-2847',
            reason: 'NAV_TIMEOUT',
            zone,
            severity: 'WARN',
          },
        },
        {
          src: 'WMS',
          code: 'TASK_NOT_COMPLETED',
          msg: `WMS: task M-2847 not completed by ${name}.`,
          payload: { robotId: name, taskId: 'M-2847', status: 'NOT_COMPLETED', severity: 'WARN' },
        },
      ]
    case 'IT-012':
      return [
        {
          src: 'RMS',
          code: 'SYNC_TIMEOUT',
          msg: `RMS-WMS sync timeout for ${name}. Status mismatch.`,
          payload: { robotId: name, syncDuration: '45s', severity: 'ERROR' },
        },
        {
          src: 'RMS',
          code: 'DATA_MISMATCH',
          msg: `Status mismatch: RMS reports IDLE, WMS expects MOVING for ${name}.`,
          payload: { robotId: name, rmsStatus: 'IDLE', wmsStatus: 'MOVING', severity: 'WARN' },
        },
      ]
    case 'IT-009':
      return [
        {
          src: 'RMS',
          code: 'MOTOR_OVERHEAT',
          msg: `Robot ${name} motor temperature 87°C exceeds threshold 85°C.`,
          payload: { robotId: name, temperature: 87, threshold: 85, zone, severity: 'ERROR' },
        },
      ]
    case 'IT-008':
      return [
        {
          src: 'RMS',
          code: 'LIDAR_ERROR',
          msg: `Robot ${name} lidar error 0x4F. Sensor contaminated.`,
          payload: { robotId: name, sensor: 'LIDAR', errorCode: '0x4F', severity: 'WARN' },
        },
        {
          src: 'WMS',
          code: 'TASK_NOT_COMPLETED',
          msg: `WMS: task M-3077 not completed by ${name}. Route unfinished.`,
          payload: { robotId: name, taskId: 'M-3077', status: 'NOT_COMPLETED', severity: 'WARN' },
        },
      ]
    case 'IT-002':
      return [
        {
          src: 'RMS',
          code: 'RIGHT_DRIVE_OVERCURRENT',
          msg: `Robot ${name} right drive current exceeds threshold. Protective shutdown.`,
          payload: {
            robotId: name,
            current: 19.1,
            threshold: 15,
            drive: 'RIGHT',
            severity: 'CRITICAL',
          },
        },
        {
          src: 'RMS',
          code: 'WHEEL_SPEED_MISMATCH',
          msg: `Robot ${name} wheel speed mismatch: right 0 rpm, left 120 rpm.`,
          payload: { robotId: name, rightRpm: 0, leftRpm: 120, severity: 'ERROR' },
        },
      ]
    case 'IT-014':
      return [
        {
          src: 'RMS',
          code: 'CONTROLLER_REBOOT',
          msg: `Robot ${name} controller rebooted during mission. Firmware profile v4.8 active.`,
          payload: {
            robotId: name,
            firmware: 'v4.8',
            profile: 'motion_profile_v4.8',
            severity: 'ERROR',
          },
        },
        {
          src: 'WMS',
          code: 'TASK_NOT_STARTED',
          msg: `WMS: task M-4210 not started by ${name}: controller unavailable.`,
          payload: { robotId: name, taskId: 'M-4210', status: 'NOT_STARTED', severity: 'WARN' },
        },
      ]
    default:
      return [
        {
          src: 'RMS',
          code: 'DEVICE_ALERT',
          msg: `Robot ${name} reported device alert in zone ${zone}.`,
          payload: { robotId: name, zone, severity: 'WARN' },
        },
      ]
  }
}
