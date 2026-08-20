import type {
  Incident,
  OperationalEvent,
  Downtime,
  ServiceAction,
  SourceInstance,
  RecoveryConfirmation,
  TimelineEntry,
  Robot,
  Site,
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
} from '@/types/domain'

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

// ─── Org / Sites / Rates ──────────────────────────────────────────────────

const sites: Site[] = [
  { id: 'site-obh', name: 'РЦ Обухово', address: 'СПб, Обухово', timezone: 'Europe/Moscow' },
  { id: 'site-pod', name: 'РЦ Подольск', address: 'МО, Подольск', timezone: 'Europe/Moscow' },
  { id: 'site-dom', name: 'ФФЦ Домодедово', address: 'МО, Домодедово', timezone: 'Europe/Moscow' },
]

const SITE_RATES: Record<string, number> = {
  'site-obh': 55000,
  'site-pod': 70000,
  'site-dom': 45000,
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

// Зоны базирования роботов (канонические, ТЗ §9: зона едина на всех вкладках).
const ROBOT_ZONES: Record<string, string> = {
  'fmr-1': 'C-12',
  'fmr-4': 'D-2',
  'fmr-7': 'D-2',
  'hik-6': 'A-3',
  'hik-3': 'A-3',
  'hik-8': 'B-2',
}

function buildRobots(): Robot[] {
  const robots: Robot[] = []
  for (let i = 1; i <= 9; i++)
    robots.push({
      id: `hik-${i}`,
      name: `HIK-AMR-${String(i).padStart(3, '0')}`,
      model: 'HIK AMR (модель не подтверждена)',
      vendor: 'HIK Robotics',
      siteId: 'site-obh',
      status: i === 6 ? ('MAINTENANCE' as const) : ('ACTIVE' as const),
      zoneName: ROBOT_ZONES[`hik-${i}`] ?? null,
      serialNumber: `HIK-${2025}${String(i).padStart(3, '0')}`,
      sourceInstanceId: 'src-hik-obh',
    })
  for (let i = 1; i <= 10; i++)
    robots.push({
      id: `fmr-${i}`,
      name: `FMR-${String(i).padStart(3, '0')}`,
      model: 'FMR (класс решения; модель не подтверждена)',
      vendor: 'Синтетическая демо-легенда',
      siteId: 'site-pod',
      status: i === 4 ? ('MAINTENANCE' as const) : ('ACTIVE' as const),
      zoneName: ROBOT_ZONES[`fmr-${i}`] ?? null,
      serialNumber: `FMR-${2026}${String(i).padStart(3, '0')}`,
      sourceInstanceId: 'src-fm-pod',
    })
  for (let i = 1; i <= 7; i++)
    robots.push({
      id: `qtr-${i}`,
      name: `QTR-AMR-${String(i).padStart(3, '0')}`,
      model: 'Quicktron M60 (синтетический парк)',
      vendor: 'Quicktron',
      siteId: 'site-dom',
      status: 'ACTIVE' as const,
      zoneName: null,
      serialNumber: `QTR-${2026}${String(i).padStart(3, '0')}`,
      sourceInstanceId: 'src-qrcs-dom',
    })
  return robots
}

// ─── Incident templates (ТЗ §2: 30 инцидентов, 58.8ч, 3 384 500 ₽) ────────

interface T {
  type: string
  title: string
  desc: string
  siteId: string
  robotId: string
  zone: string
  status: IncidentStatus
  source: IncidentSourceKind
  causeCode: string | null
  maturity: Incident['causeMaturity']
  causeComment?: string
  dtStatus: Downtime['confirmationStatus']
  dtHours: number
  actions: Array<{ type: string; name: string; result: ServiceAction['result']; comment?: string }>
  recovery: boolean
  daysAgo: number
  coordinator: string | null
  slaReactionMin: number | null
  slaRecoveryMin: number | null
}

// Целевое распределение (ТЗ §2):
// CA-041: 6 / 24.1ч / 1 405 000₽
// CA-044: 7 / 13.8ч / 795 000₽
// CA-022: 4 / 9.0ч / 520 000₽
// CA-023: 4 / 5.6ч / 315 000₽
// CA-011: 3 / 3.1ч / 180 000₽
// CA-015: 2 / 1.5ч / 90 000₽
// CA-032: 2 / 1.1ч / 55 000₽
// CA-060: 2 / 0.5ч / 24 500₽
// Итого: 30 / 58.8ч / 3 384 500₽

const DOWNTIME_KIND_BY_CAUSE: Record<string, Downtime['kind']> = {
  'CA-041': 'ACCIDENT_SAFETY',
  'CA-044': 'ORGANIZATIONAL',
  'CA-022': 'INFRASTRUCTURE',
  'CA-023': 'INFRASTRUCTURE',
  'CA-032': 'INFRASTRUCTURE',
}

const templates: T[] = [
  // ══ ГЛАВНЫЙ КЕЙС: ДТП (INC-0014 по ТЗ §3) ══
  {
    type: 'IT-011',
    title:
      'Аварийная остановка FMR-001 после контакта с палетной техникой; повреждён правый привод',
    desc: 'Зона C-12, пересечение роботизированного и погрузочного маршрутов. Сработал защитный бампер, ток правого привода выше порога. WMS зафиксировал срыв задания M-2847.',
    siteId: 'site-pod',
    robotId: 'fmr-1',
    zone: 'C-12 «Пересечение маршрутов»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment:
      'Контакт с погрузчиком в зоне C-12. Повреждён правый приводной узел. Акт и фото приложены оператором.',
    dtStatus: 'CONFIRMED',
    dtHours: 6.8333, // 6ч 50мин × 70 000 = 478 333₽
    actions: [
      {
        type: 'SECURE',
        name: 'Оградить место, зафиксировать акт и фото',
        result: 'SUCCESS',
        comment: 'Акт №А-142, фото повреждения',
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
        name: 'Физическое разделение маршрутов + регламент движения погрузчиков',
        result: 'SUCCESS',
        comment: 'Ограждение установлено, регламент обновлён',
      },
    ],
    recovery: true,
    daysAgo: 2,
    coordinator: 'Иван Петров',
    slaReactionMin: 8,
    slaRecoveryMin: 410,
  },
  // ══ Сценарий 2: Палеты (ТЗ §4) — 7 инцидентов CA-044 ══
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-006 в зоне приёмки A-3',
    desc: 'Проезд заблокирован палетами, размещёнными вне буферной зоны. Пять повторов за период — доказательство системного нарушения.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zone: 'A-3 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment:
      'Палеты в проходе A-3 вне буферной зоны. Пятый повтор за период. Фото оператора приложено.',
    dtStatus: 'CONFIRMED',
    dtHours: 2.5,
    actions: [
      { type: 'INSPECTION', name: 'Осмотр зоны A-3', result: 'SUCCESS', comment: 'Палеты убраны' },
      {
        type: 'ORGANIZATION',
        name: 'Нанести границу буферной зоны + проверка в сдаче смены',
        result: 'SUCCESS',
        comment: 'Разметка нанесена',
      },
    ],
    recovery: true,
    daysAgo: 3,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 6,
    slaRecoveryMin: 185,
  },
  {
    type: 'IT-003',
    title: 'Повторная блокировка HIK-AMR-006 в A-3',
    desc: 'Палеты снова в проходе A-3.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zone: 'A-3 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [{ type: 'INSPECTION', name: 'Осмотр зоны', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 8,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 5,
    slaRecoveryMin: 140,
  },
  {
    type: 'IT-003',
    title: 'Блокировка QTR-AMR-002 паллетой',
    desc: 'Проезд в D-1 заблокирован.',
    siteId: 'site-dom',
    robotId: 'qtr-2',
    zone: 'D-1 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [
      {
        type: 'INSPECTION',
        name: 'Осмотр',
        result: 'SUCCESS',
        comment: 'Робот перенаправлен — процесс компенсирован',
      },
    ],
    recovery: true,
    daysAgo: 5,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 4,
    slaRecoveryMin: 8,
  },
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-001 тележкой',
    desc: 'Тележка в проходе B-2.',
    siteId: 'site-obh',
    robotId: 'hik-1',
    zone: 'B-2 «Хранение»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 2.0,
    actions: [{ type: 'INSPECTION', name: 'Осмотр', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 12,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 7,
    slaRecoveryMin: 115,
  },
  {
    type: 'IT-003',
    title: 'Блокировка FMR-005 палетами',
    desc: 'Палеты вне буферной зоны C-4.',
    siteId: 'site-pod',
    robotId: 'fmr-5',
    zone: 'C-4 «Комплектация»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 2.5,
    actions: [{ type: 'INSPECTION', name: 'Осмотр', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 15,
    coordinator: 'Иван Петров',
    slaReactionMin: 9,
    slaRecoveryMin: 160,
  },
  {
    type: 'IT-003',
    title: 'Блокировка QTR-AMR-004',
    desc: 'Проезд в D-3 заблокирован паллетами.',
    siteId: 'site-dom',
    robotId: 'qtr-4',
    zone: 'D-3 «Отгрузка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.83333,
    actions: [{ type: 'INSPECTION', name: 'Осмотр', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 19,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 6,
    slaRecoveryMin: 145,
  },
  {
    type: 'IT-003',
    title: 'Блокировка HIK-AMR-008',
    desc: 'Палеты в проходе A-1.',
    siteId: 'site-obh',
    robotId: 'hik-8',
    zone: 'A-1 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    dtStatus: 'REJECTED',
    dtHours: 1.5,
    actions: [{ type: 'INSPECTION', name: 'Осмотр', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 22,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 5,
    slaRecoveryMin: 130,
  },

  // ══ Сценарий 3: Wi-Fi (ТЗ §5) — 4 инцидента CA-022 ══
  {
    type: 'IT-005',
    title: 'Потеря связи FMR-001 и FMR-004 в зоне D-2',
    desc: 'Точка доступа AP-17 недоступна. COMM_LOST и HEARTBEAT_TIMEOUT от обоих роботов.',
    siteId: 'site-pod',
    robotId: 'fmr-4',
    zone: 'D-2 «Отгрузка»',
    status: 'WAITING',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    causeComment:
      'Недоступна точка Wi-Fi AP-17. Зона D-2 имеет недостаточное покрытие. Мониторинг сети подтверждает.',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [
      {
        type: 'DIAGNOSTICS',
        name: 'Диагностика точки доступа AP-17',
        result: 'SUCCESS',
        comment: 'AP-17 не отвечает',
      },
      {
        type: 'REPAIR',
        name: 'Замена точки доступа',
        result: 'POSTPONED',
        comment: 'Эскалация в ИТ-инфраструктуру',
      },
    ],
    recovery: false,
    daysAgo: 0,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 12,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-005',
    title: 'Потеря связи FMR-001 в D-2 (повтор)',
    desc: 'Wi-Fi недоступен в зоне D-2.',
    siteId: 'site-pod',
    robotId: 'fmr-1',
    zone: 'D-2 «Отгрузка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [
      {
        type: 'DIAGNOSTICS',
        name: 'Проверка сети',
        result: 'SUCCESS',
        comment: 'AP-17 перегружен',
      },
    ],
    recovery: true,
    daysAgo: 7,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 10,
    slaRecoveryMin: 125,
  },
  {
    type: 'IT-005',
    title: 'Потеря связи HIK-AMR-002',
    desc: 'Wi-Fi недоступен 8 минут в B-1.',
    siteId: 'site-obh',
    robotId: 'hik-2',
    zone: 'B-1 «Хранение»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 4.0,
    actions: [{ type: 'DIAGNOSTICS', name: 'Проверка сети', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 10,
    coordinator: 'Иван Петров',
    slaReactionMin: 8,
    slaRecoveryMin: 95,
  },
  {
    type: 'IT-005',
    title: 'Потеря связи FMR-006',
    desc: 'Нет ответа 20 минут, зона C-2.',
    siteId: 'site-pod',
    robotId: 'fmr-6',
    zone: 'C-2 «Отгрузка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    dtStatus: 'REJECTED',
    dtHours: 2.0,
    actions: [{ type: 'DIAGNOSTICS', name: 'Проверка сети', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 4,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 15,
    slaRecoveryMin: 130,
  },

  // ══ Разметка/карта (ТЗ §14 INC-0001) — 4 инцидента CA-023 ══
  {
    type: 'IT-007',
    title: 'Потеря локализации HIK-AMR-006 в зоне A-3',
    desc: 'После перестановки стеллажей фактическая геометрия прохода перестала соответствовать карте RMS. HIK RMS передал NAVIGATION_LOST и TASK_INTERRUPTED; WMS — TASK_NOT_COMPLETED по заданию M-2847.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zone: 'A-3 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment:
      'После перестановки стеллажей геометрия прохода A-3 не соответствует карте. Ошибка воспроизведена; карта обновлена, контрольный маршрут успешен.',
    dtStatus: 'CONFIRMED',
    dtHours: 2.54556,
    actions: [
      {
        type: 'INSPECTION',
        name: 'Проверка зоны A-3 и сравнение с картой',
        result: 'SUCCESS',
        comment: 'Расхождение геометрии подтверждено',
      },
      {
        type: 'MAP_UPDATE',
        name: 'Актуализация карты зоны',
        result: 'SUCCESS',
        comment: 'Карта обновлена до актуальной версии',
      },
      {
        type: 'TEST_RUN',
        name: 'Контрольный маршрут',
        result: 'SUCCESS',
        comment: 'Пройден без ошибок',
      },
    ],
    recovery: true,
    daysAgo: 6,
    coordinator: 'Иван Петров',
    slaReactionMin: 5,
    slaRecoveryMin: 155,
  },
  {
    type: 'IT-007',
    title: 'Повторная потеря локализации HIK-AMR-006 в A-3',
    desc: 'Та же координата после перестановки.',
    siteId: 'site-obh',
    robotId: 'hik-6',
    zone: 'A-3 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    dtStatus: 'REJECTED',
    dtHours: 1.5,
    actions: [{ type: 'MAP_UPDATE', name: 'Обновление карты', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 9,
    coordinator: 'Иван Петров',
    slaReactionMin: 4,
    slaRecoveryMin: 90,
  },
  {
    type: 'IT-007',
    title: 'Ошибка навигации QTR-AMR-001',
    desc: 'Карта зоны некорректна.',
    siteId: 'site-dom',
    robotId: 'qtr-1',
    zone: 'D-2 «Отгрузка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.77778,
    actions: [{ type: 'MAP_UPDATE', name: 'Обновление карты', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 13,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 6,
    slaRecoveryMin: 70,
  },
  {
    type: 'IT-007',
    title: 'Ошибка навигации HIK-AMR-004',
    desc: 'Потеря локализации в B-2.',
    siteId: 'site-obh',
    robotId: 'hik-4',
    zone: 'B-2 «Хранение»',
    status: 'IN_PROGRESS',
    source: 'MANUAL',
    causeCode: 'CA-060',
    maturity: 'PRIMARY',
    dtStatus: 'PROPOSED',
    dtHours: 0,
    actions: [],
    recovery: false,
    daysAgo: 0,
    coordinator: 'Иван Петров',
    slaReactionMin: 11,
    slaRecoveryMin: null,
  },

  // ══ Столкновения CA-041 — 5 дополнительных ══
  {
    type: 'IT-011',
    title: 'Аварийная остановка FMR-003 после контакта с погрузчиком',
    desc: 'Зона C-8, контакт с погрузчиком. Повреждён левый бампер.',
    siteId: 'site-pod',
    robotId: 'fmr-3',
    zone: 'C-8 «Комплектация»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    dtStatus: 'REJECTED',
    dtHours: 5.5,
    actions: [
      { type: 'REPAIR', name: 'Замена левого бампера', result: 'SUCCESS' },
      { type: 'TEST_RUN', name: 'Контрольный маршрут', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 8,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 7,
    slaRecoveryMin: 340,
  },
  {
    type: 'IT-002',
    title: 'Отказ правого привода HIK-AMR-005 после столкновения',
    desc: 'Контакт с pallet-техникой. Правый привод повреждён.',
    siteId: 'site-obh',
    robotId: 'hik-5',
    zone: 'B-3 «Хранение»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 7.0,
    actions: [{ type: 'REPAIR', name: 'Замена привода', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 14,
    coordinator: 'Иван Петров',
    slaReactionMin: 9,
    slaRecoveryMin: 400,
  },
  {
    type: 'IT-002',
    title: 'Повреждён передний датчик QTR-AMR-005',
    desc: 'Контакт с тележкой. Датчик смещён.',
    siteId: 'site-dom',
    robotId: 'qtr-5',
    zone: 'D-1 «Приёмка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 2.5,
    actions: [{ type: 'REPAIR', name: 'Калибровка датчика', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 18,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 6,
    slaRecoveryMin: 190,
  },
  {
    type: 'IT-011',
    title: 'Столкновение FMR-007 с колонной',
    desc: 'Зона B-7. Повреждён корпус.',
    siteId: 'site-pod',
    robotId: 'fmr-7',
    zone: 'B-7 «Хранение»',
    status: 'READY_TO_CLOSE',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'REFINED',
    dtStatus: 'CONFIRMED',
    dtHours: 1.16667,
    actions: [
      { type: 'REPAIR', name: 'Ремонт корпуса', result: 'SUCCESS' },
      { type: 'TEST_RUN', name: 'Контрольный запуск', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 0,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 8,
    slaRecoveryMin: 175,
  },
  {
    type: 'IT-011',
    title: 'Контакт QTR-AMR-007 с ограждением',
    desc: 'Зона D-5. Царапины корпуса.',
    siteId: 'site-dom',
    robotId: 'qtr-7',
    zone: 'D-5 «Отгрузка»',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.61111,
    actions: [
      { type: 'INSPECTION', name: 'Осмотр', result: 'SUCCESS', comment: 'Повреждения минимальны' },
    ],
    recovery: true,
    daysAgo: 25,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 3,
    slaRecoveryMin: 30,
  },

  // ══ Аккумулятор CA-011 — 3 (ТЗ §6) ══
  {
    type: 'IT-006',
    title: 'Деградация батареи HIK-AMR-003',
    desc: 'Ёмкость 62% от номинала, циклов > 800. Третий повтор за период — рекомендована замена.',
    siteId: 'site-obh',
    robotId: 'hik-3',
    zone: 'B-1 «Хранение»',
    status: 'IN_PROGRESS',
    source: 'MANUAL',
    causeCode: 'CA-011',
    maturity: 'REFINED',
    causeComment: 'Третий инцидент за период. Снижение ёмкости подтверждено диагностикой.',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [
      {
        type: 'DIAGNOSTICS',
        name: 'Диагностика АКБ',
        result: 'PARTIAL_SUCCESS',
        comment: 'Ёмкость 62%, циклов 830',
      },
      { type: 'REPAIR', name: 'Замена АКБ', result: null, comment: 'Ожидание запчасти' },
    ],
    recovery: false,
    daysAgo: 1,
    coordinator: 'Иван Петров',
    slaReactionMin: 5,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-006',
    title: 'Деградация батареи FMR-008',
    desc: 'Ёмкость 58%.',
    siteId: 'site-pod',
    robotId: 'fmr-8',
    zone: 'C-1 «Отгрузка»',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-011',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.0,
    actions: [{ type: 'REPAIR', name: 'Замена АКБ', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 18,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 7,
    slaRecoveryMin: 65,
  },
  {
    type: 'IT-006',
    title: 'Разряд батареи QTR-AMR-006',
    desc: 'Ёмкость 65%.',
    siteId: 'site-dom',
    robotId: 'qtr-6',
    zone: 'D-4 «Комплектация»',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-011',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.61111,
    actions: [{ type: 'REPAIR', name: 'Замена АКБ', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 22,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 4,
    slaRecoveryMin: 40,
  },

  // ══ Зарядная станция CA-015 — 2 ══
  {
    type: 'IT-006',
    title: 'Не заряжается HIK-AMR-008 на станции SK-03',
    desc: 'Зарядная станция не инициирует зарядку. Неисправен контактный блок.',
    siteId: 'site-obh',
    robotId: 'hik-8',
    zone: 'Зона зарядки',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-015',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 1.0,
    actions: [{ type: 'REPAIR', name: 'Замена контактного блока SK-03', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 12,
    coordinator: 'Иван Петров',
    slaReactionMin: 6,
    slaRecoveryMin: 55,
  },
  {
    type: 'IT-006',
    title: 'Не заряжается FMR-009 на SK-07',
    desc: 'Контроллер станции неисправен.',
    siteId: 'site-pod',
    robotId: 'fmr-9',
    zone: 'Зона зарядки',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-015',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [{ type: 'REPAIR', name: 'Замена контроллера', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 20,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 5,
    slaRecoveryMin: 35,
  },

  // ══ RMS-WMS CA-032 — 2 ══
  {
    type: 'IT-012',
    title: 'Сбой обмена HIK RMS — WMS на Обухово',
    desc: 'SYNC_TIMEOUT и DATA_MISMATCH. Статус задания расходится между RMS и WMS.',
    siteId: 'site-obh',
    robotId: 'hik-1',
    zone: 'Системный контур',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-032',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [{ type: 'CONFIG', name: 'Перенастройка таймаутов', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 7,
    coordinator: 'Иван Петров',
    slaReactionMin: 10,
    slaRecoveryMin: 50,
  },
  {
    type: 'IT-012',
    title: 'Несогласованность Quicktron RCS — WMS',
    desc: 'Таймаут синхронизации статусов.',
    siteId: 'site-dom',
    robotId: 'qtr-3',
    zone: 'Системный контур',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-032',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.61111,
    actions: [{ type: 'CONFIG', name: 'Настройка синхронизации', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 21,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 8,
    slaRecoveryMin: 20,
  },

  // ══ Не определена CA-060 — 2 ══
  {
    type: 'IT-009',
    title: 'Перегрев HIK-AMR-009',
    desc: 'Температура двигателя превысила 85°C. Диагностика продолжается.',
    siteId: 'site-obh',
    robotId: 'hik-9',
    zone: 'B-3 «Хранение»',
    status: 'IN_PROGRESS',
    source: 'AUTOMATIC',
    causeCode: 'CA-060',
    maturity: 'NONE',
    dtStatus: 'CONFIRMED',
    dtHours: 0.05472,
    actions: [
      {
        type: 'DIAGNOSTICS',
        name: 'Диагностика системы охлаждения',
        result: null,
        comment: 'В работе',
      },
    ],
    recovery: false,
    daysAgo: 0,
    coordinator: 'Иван Петров',
    slaReactionMin: 14,
    slaRecoveryMin: null,
  },
  {
    type: 'IT-008',
    title: 'Ошибка датчика QTR-AMR-002',
    desc: 'Сбой энкодера. Диагностика не завершена.',
    siteId: 'site-dom',
    robotId: 'qtr-2',
    zone: 'D-2 «Отгрузка»',
    status: 'OPEN',
    source: 'AUTOMATIC',
    causeCode: 'CA-060',
    maturity: 'NONE',
    dtStatus: 'CONFIRMED',
    dtHours: 0.52861,
    actions: [],
    recovery: false,
    daysAgo: 0,
    coordinator: null,
    slaReactionMin: null,
    slaRecoveryMin: null,
  },

  // ══ Дополнительные (заменили старые CA-014) ══
  // ── Добор до целевого распределения §2 (вариант «б»: лидар сверх) ──
  {
    type: 'IT-011',
    title: 'Столкновение HIK-AMR-004 с погрузчиком в зоне приёмки',
    desc: 'Контакт при выезде из стеллажного прохода; повреждён корпус. Движение остановлено защитой.',
    siteId: 'site-obh',
    robotId: 'hik-4',
    zone: 'A-1 <приёмка>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-041',
    maturity: 'FINAL',
    causeComment:
      'Столкновение с погрузчиком подтверждено актам и журналу RMS; ремонт по гарантии сервиса.',
    dtStatus: 'CONFIRMED',
    dtHours: 5.0,
    actions: [{ type: 'REPAIR', name: 'Ремонт корпуса и контрольный маршрут', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 19,
    coordinator: 'Игорь Смирнов',
    slaReactionMin: 10,
    slaRecoveryMin: 300,
  },
  {
    type: 'IT-003',
    title: 'Проезд FMR-010 заблокирован палетами у зоны комплектации',
    desc: 'Палеты размещены вне буферной зоны; пять повторных попыток маршрута за смену.',
    siteId: 'site-pod',
    robotId: 'fmr-10',
    zone: 'K-2 <комплектация>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-044',
    maturity: 'FINAL',
    causeComment:
      'Повторяющаяся блокировка из-за размещения палет вне разметки; зона включена в проверку при сдаче смены.',
    dtStatus: 'CONFIRMED',
    dtHours: 2.0,
    actions: [
      { type: 'ORGANIZATION', name: 'Перенос места временного складирования', result: 'SUCCESS' },
    ],
    recovery: true,
    daysAgo: 6,
    coordinator: 'Анна Петрова',
    slaReactionMin: 8,
    slaRecoveryMin: 120,
  },
  {
    type: 'IT-005',
    title: 'Потеря связи QTR-AMR-004 на участке отгрузки',
    desc: 'Недоступность точки доступа на участке отгрузки; мониторинг подтвердил деградацию покрытия.',
    siteId: 'site-dom',
    robotId: 'qtr-4',
    zone: 'D-3 <отгрузка>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-022',
    maturity: 'FINAL',
    causeComment:
      'Точка доступа отгрузки перегружена в пиковые часы; рекомендовано повторное обследование покрытия.',
    dtStatus: 'CONFIRMED',
    dtHours: 2.0,
    actions: [{ type: 'DIAGNOSTICS', name: 'Диагностика покрытия Wi-Fi', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 13,
    coordinator: 'Мария Юдина',
    slaReactionMin: 11,
    slaRecoveryMin: 118,
  },
  {
    type: 'IT-007',
    title: 'Потеря локализации FMR-004 после перестановки стеллажей',
    desc: 'Карта зоны не соответствует фактической планировке после перестановки; ошибка воспроизведена.',
    siteId: 'site-pod',
    robotId: 'fmr-4',
    zone: 'D-4 <хранение>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment:
      'После перестановки стеллажей геометрия прохода перестала соответствовать карте; карта обновлена, контрольный маршрут успешен.',
    dtStatus: 'CONFIRMED',
    dtHours: 1.5,
    actions: [{ type: 'MAP_UPDATE', name: 'Актуализация карты зоны', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 9,
    coordinator: 'Анна Петрова',
    slaReactionMin: 9,
    slaRecoveryMin: 88,
  },
  {
    type: 'IT-007',
    title: 'Несоответствие разметки QTR-AMR-006 в зоне контроля',
    desc: 'Разметка зоны контроля стёрта; локализация периодически терялась на одном участке.',
    siteId: 'site-dom',
    robotId: 'qtr-6',
    zone: 'C-1 <контроль>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-023',
    maturity: 'FINAL',
    causeComment:
      'Износ разметки на участке подтверждён сравнением карты с планировкой; разметка восстановлена.',
    dtStatus: 'CONFIRMED',
    dtHours: 0.77778,
    actions: [{ type: 'MARKING', name: 'Восстановление разметки', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 20,
    coordinator: 'Мария Юдина',
    slaReactionMin: 13,
    slaRecoveryMin: 47,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара FMR-009 в зоне комплектации C-3',
    desc: 'Повторная потеря качества сканирования в пыльной зоне C-3 (повтор кейса FMR-002).',
    siteId: 'site-pod',
    robotId: 'fmr-9',
    zone: 'C-3 <комплектация>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment:
      'Пыль на оптическом окне лидара; очищено. Второй случай в зоне C-3: включён осмотр лидаров в чек-лист смены.',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [{ type: 'CLEANING', name: 'Очистка лидара', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 4,
    coordinator: 'Анна Петрова',
    slaReactionMin: 10,
    slaRecoveryMin: 26,
  },
  {
    type: 'IT-014',
    title: 'Программный сбой QTR-AMR-007 после обновления',
    desc: 'После обновления профиля движения параметр максимального тока правого привода установлен ниже штатного. Профиль возвращён к версии 4.7.',
    siteId: 'site-dom',
    robotId: 'qtr-7',
    zone: 'D-3 «Отгрузка»',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-014',
    maturity: 'FINAL',
    causeComment:
      'Параметр max_current_right_drive = 8А вместо 12А (профиль v4.8). Лог контроллера подтверждает защитное отключение. Профиль возвращён к v4.7.',
    dtStatus: 'REJECTED',
    dtHours: 1.5,
    actions: [{ type: 'CONFIG', name: 'Возврат профиля движения к v4.7', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 16,
    coordinator: 'Ольга Кузнецова',
    slaReactionMin: 9,
    slaRecoveryMin: 95,
  },
  // ── CA-045: загрязнение лидара (ТЗ §26; 2 Обухово + 2 Подольск + 1 Домодедово; повтор в зоне B-2) ──
  {
    type: 'IT-008',
    title: 'Снижение качества локализации HIK-AMR-003 в пыльной зоне B-2',
    desc: 'Периодическая потеря качества сканирования переднего лидара в зоне приёма. Осмотр подтвердил слой складской пыли на оптическом окне.',
    siteId: 'site-obh',
    robotId: 'hik-3',
    zone: 'B-2 <приёмка>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment:
      'На оптическом окне переднего лидара обнаружен слой складской пыли. После очистки качество сканирования восстановилось; контрольный маршрут без ошибок.',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [
      {
        type: 'CLEANING',
        name: 'Очистка оптического окна лидара и контрольный маршрут',
        result: 'SUCCESS',
      },
    ],
    recovery: true,
    daysAgo: 24,
    coordinator: 'Игорь Смирнов',
    slaReactionMin: 9,
    slaRecoveryMin: 28,
  },
  {
    type: 'IT-008',
    title: 'Повторная потеря локализации HIK-AMR-008 в зоне B-2',
    desc: 'Вторая за период остановка в той же пыльной зоне приёма B-2. Сигнал LIDAR_QUALITY_DEGRADED повторился на том же участке.',
    siteId: 'site-obh',
    robotId: 'hik-8',
    zone: 'B-2 <приёмка>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment:
      'Повтор загрязнения оптического окна в зоне B-2 подтверждает системность: рекомендовано усилить уборку зоны и включить осмотр лидаров в чек-лист смены.',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [
      {
        type: 'CLEANING',
        name: 'Очистка лидара; заявка на усиление уборки зоны B-2',
        result: 'SUCCESS',
      },
    ],
    recovery: true,
    daysAgo: 10,
    coordinator: 'Игорь Смирнов',
    slaReactionMin: 11,
    slaRecoveryMin: 31,
  },
  {
    type: 'IT-008',
    title: 'Потеря локализации QTR-AMR-005 у участка отгрузки',
    desc: 'Снижение качества сканирования лидара на пыльном участке отгрузки. После очистки работа восстановлена.',
    siteId: 'site-dom',
    robotId: 'qtr-5',
    zone: 'D-3 <отгрузка>',
    status: 'CLOSED',
    source: 'AUTOMATIC',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    causeComment:
      'Пыль на оптическом окне лидара; очищено на месте. Повторяемость на объекте отслеживается.',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [{ type: 'CLEANING', name: 'Очистка оптического окна лидара', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 17,
    coordinator: 'Мария Юдина',
    slaReactionMin: 12,
    slaRecoveryMin: 27,
  },
  {
    type: 'IT-002',
    title: 'Механический износ привода HIK-AMR-007',
    desc: 'Износ подшипника подтверждён вибрационной диагностикой.',
    siteId: 'site-obh',
    robotId: 'hik-7',
    zone: 'B-1 «Хранение»',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-047',
    maturity: 'FINAL',
    dtStatus: 'REJECTED',
    dtHours: 8.0,
    actions: [{ type: 'REPAIR', name: 'Замена подшипника', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 28,
    coordinator: 'Иван Петров',
    slaReactionMin: 8,
    slaRecoveryMin: 490,
  },
  {
    type: 'IT-008',
    title: 'Загрязнение лидара FMR-002',
    desc: 'Лидар перекрыт плёнкой. Осмотр подтвердил.',
    siteId: 'site-pod',
    robotId: 'fmr-2',
    zone: 'C-3 «Комплектация»',
    status: 'CLOSED',
    source: 'MANUAL',
    causeCode: 'CA-045',
    maturity: 'FINAL',
    dtStatus: 'CONFIRMED',
    dtHours: 0.5,
    actions: [{ type: 'CLEANING', name: 'Очистка лидара', result: 'SUCCESS' }],
    recovery: true,
    daysAgo: 11,
    coordinator: 'Дмитрий Волков',
    slaReactionMin: 3,
    slaRecoveryMin: 30,
  },
]

// ─── Generate ───────────────────────────────────────────────────────────────

export function generateDemoData() {
  const robots = buildRobots()
  const incs: Incident[] = []
  const evts: OperationalEvent[] = []
  const dts: Downtime[] = []
  const acts: ServiceAction[] = []
  const recs: RecoveryConfirmation[] = []
  const tl: TimelineEntry[] = []
  const causes: CauseClassification[] = []
  const maints: MaintenanceWork[] = []
  let evtC = 0,
    actC = 0,
    tlC = 0

  templates.forEach((t, idx) => {
    const incId = `inc-${String(idx + 1).padStart(3, '0')}`
    const num = `INC-${now().getFullYear()}-${String(idx + 1).padStart(4, '0')}`
    const detected = daysAgo(t.daysAgo, 8 + (idx % 4), (idx * 13) % 60)
    const opened = daysAgo(t.daysAgo, 8 + (idx % 4), (idx * 13 + 5) % 60)
    const severity = INCIDENT_TYPES[t.type]?.severity ?? 'MEDIUM'
    const rate = SITE_RATES[t.siteId] ?? 50000

    const dtStart = daysAgo(t.daysAgo, 8, 30)
    const dtSeconds = t.dtStatus === 'CONFIRMED' ? Math.round(t.dtHours * 3600) : 0
    // Конец интервала строго из длительности (валидатор §23: длительность = из меток).
    const dtEnd =
      t.dtHours > 0 && t.status !== 'OPEN' && t.status !== 'WAITING'
        ? new Date(Date.parse(dtStart) + dtSeconds * 1000).toISOString().replace('.000Z', 'Z')
        : null
    const loss = t.dtStatus === 'CONFIRMED' ? Math.round((dtSeconds / 3600) * rate) : 0
    const closedAt = t.status === 'CLOSED' ? daysAgo(Math.max(0, t.daysAgo - 1), 15, 0) : null

    incs.push({
      id: incId,
      incidentNumber: num,
      title: t.title,
      description: t.desc,
      siteId: t.siteId,
      zoneName: t.zone,
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
      hasDowntime: t.dtHours > 0,
      downtimeConfirmed: t.dtStatus === 'CONFIRMED',
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
      const raws = withHuman(rawEventsFor(t.type, t.robotId, t.zone))
      raws.forEach((re, e) => {
        evtC++
        const time = daysAgo(t.daysAgo, 7, (idx * 7 + e * 3) % 60)
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

    // Downtime
    if (t.dtHours > 0 || t.dtStatus === 'REJECTED') {
      dts.push({
        id: `dt-${String(idx + 1).padStart(3, '0')}`,
        incidentId: incId,
        siteId: t.siteId,
        robotId: t.robotId,
        downtimeType: 'FULL',
        confirmationStatus: t.dtStatus,
        zoneName: t.zone,
        confirmedBy: t.dtStatus === 'CONFIRMED' ? t.coordinator : null,
        confirmedAt: t.dtStatus === 'CONFIRMED' ? (dtEnd ?? dtStart) : null,
        kind: DOWNTIME_KIND_BY_CAUSE[t.causeCode ?? ''] ?? 'UNPLANNED_TECHNICAL',
        impactObject: 'ROBOT',
        impact: { backupRobotId: null, compensation: 'NONE', adjustmentBasis: null },
        intervalState:
          dtEnd || t.status === 'OPEN' || t.status === 'WAITING'
            ? dtEnd
              ? 'CLOSED'
              : 'OPEN'
            : 'CLOSED',
        startedAt: dtStart,
        endedAt: dtEnd,
        calendarDurationSeconds: dtSeconds,
        accountableDurationSeconds: dtSeconds,
        ruleCode: 'RULE_SYS_CALENDAR_24X7',
        ruleName: 'Календарь 24×7',
        fallbackApplied: true,
        ratePerHour: rate,
        lossRubles: loss,
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
          classifiedAt: daysAgo(t.daysAgo, 10, 0),
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
          classifiedAt: daysAgo(Math.max(0, t.daysAgo - 1), 12, 0),
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
        createdAt: daysAgo(t.daysAgo, 9, 0),
        startedAt: a.result ? daysAgo(t.daysAgo, 9, 30) : null,
        completedAt: a.result ? daysAgo(t.daysAgo, 10, 0) : null,
        comment: a.comment ?? null,
      })
    })

    // Recovery
    if (t.recovery) {
      recs.push({
        incidentId: incId,
        recoveredAt: closedAt ?? daysAgo(0, 12, 0),
        confirmedBy: t.coordinator ?? 'Елена Смирнова',
        basis: 'SUCCESSFUL_ACTION',
        actionId: acts.length > 0 ? acts[acts.length - 1].id : null,
        comment: 'Восстановление подтверждено',
      })
    }

    // Unified timeline (ТЗ §12: единая история)
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
        timestamp: daysAgo(t.daysAgo, 8, 45),
        eventType: 'ASSIGNED',
        summary: `Назначен координатор: ${t.coordinator}`,
        actorName: t.coordinator,
        isAutomatic: false,
        details: null,
      })
    }
    if (t.maturity === 'REFINED' || t.maturity === 'FINAL') {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: daysAgo(t.daysAgo, 10, 0),
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
        timestamp: daysAgo(Math.max(0, t.daysAgo - 1), 12, 0),
        eventType: 'CAUSE',
        summary: `Причина подтверждена: ${causeLabel(t.causeCode)}`,
        actorName: `${t.coordinator ?? 'Иван Петров'} (руководитель)`,
        isAutomatic: false,
        details: null,
      })
    }
    if (t.dtStatus === 'CONFIRMED') {
      tlC++
      tl.push({
        id: `tl-${tlC}`,
        incidentId: incId,
        timestamp: dtEnd ?? daysAgo(0, 12, 0),
        eventType: 'DOWNTIME',
        summary: `Простой подтверждён: ${t.dtHours.toFixed(1)} ч × ${rate.toLocaleString('ru-RU')} ₽/ч = ${loss.toLocaleString('ru-RU')} ₽`,
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
        timestamp: closedAt ?? daysAgo(0, 12, 0),
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
    .filter((d) => d.confirmationStatus === 'CONFIRMED' && d.accountableDurationSeconds > 0)
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
  ]

  // ТОиР (ТЗ §19: минимум 8 работ)
  maints.push(
    {
      id: 'mnt-001',
      type: 'EMERGENCY',
      title: 'Аварийный ремонт: замена правого привода FMR-001',
      robotId: 'fmr-1',
      siteId: 'site-pod',
      incidentId: 'inc-001',
      executor: 'Сергей Иванов',
      dueAt: daysAgo(1),
      completedAt: daysAgo(2),
      status: 'RESULT_CONFIRMED',
      result: 'Привод заменён, контрольный маршрут пройден',
    },
    {
      id: 'mnt-002',
      type: 'CORRECTIVE',
      title: 'Обновление карты зоны A-3',
      robotId: 'hik-6',
      siteId: 'site-obh',
      incidentId: 'inc-013',
      executor: 'Сергей Иванов',
      dueAt: daysAgo(4),
      completedAt: daysAgo(6),
      status: 'RESULT_CONFIRMED',
      result: 'Карта актуализирована',
    },
    {
      id: 'mnt-003',
      type: 'EMERGENCY',
      title: 'Замена АКБ HIK-AMR-003',
      robotId: 'hik-3',
      siteId: 'site-obh',
      incidentId: 'inc-027',
      executor: 'Сергей Иванов',
      dueAt: daysAgo(-3),
      completedAt: null,
      status: 'WAITING_PARTS',
      result: null,
    },
    {
      id: 'mnt-004',
      type: 'EMERGENCY',
      title: 'Ремонт зарядной станции SK-03',
      robotId: 'hik-8',
      siteId: 'site-obh',
      incidentId: 'inc-030',
      executor: 'Дмитрий Волков',
      dueAt: daysAgo(11),
      completedAt: daysAgo(12),
      status: 'DONE',
      result: 'Контактный блок заменён',
    },
    {
      id: 'mnt-005',
      type: 'DIAGNOSTIC',
      title: 'Диагностика точки Wi-Fi AP-17',
      robotId: 'fmr-4',
      siteId: 'site-pod',
      incidentId: 'inc-009',
      executor: 'ИТ-отдел',
      dueAt: daysAgo(-1),
      completedAt: null,
      status: 'IN_PROGRESS',
      result: null,
    },
    {
      id: 'mnt-006',
      type: 'PLANNED',
      title: 'Плановое ТО: FMR-002 (цикл 500ч)',
      robotId: 'fmr-2',
      siteId: 'site-pod',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(5),
      completedAt: daysAgo(5),
      status: 'RESULT_CONFIRMED',
      result: 'ТО выполнено по регламенту',
    },
    {
      id: 'mnt-007',
      type: 'PLANNED',
      title: 'Плановое ТО: HIK-AMR-001 (цикл 500ч)',
      robotId: 'hik-1',
      siteId: 'site-obh',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(-7),
      completedAt: null,
      status: 'PLANNED',
      result: null,
    },
    {
      id: 'mnt-008',
      type: 'PLANNED',
      title: 'Плановое ТО: QTR-AMR-003 (цикл 500ч)',
      robotId: 'qtr-3',
      siteId: 'site-dom',
      incidentId: null,
      executor: 'Сергей Иванов',
      dueAt: daysAgo(3),
      completedAt: daysAgo(3),
      status: 'DONE',
      result: 'ТО выполнено',
    },
    {
      id: 'mnt-009',
      type: 'EMERGENCY',
      title: 'Ремонт корпуса FMR-007 после столкновения',
      robotId: 'fmr-7',
      siteId: 'site-pod',
      incidentId: 'inc-024',
      executor: 'Сергей Иванов',
      dueAt: daysAgo(0),
      completedAt: null,
      status: 'ASSIGNED',
      result: null,
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
    sites,
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
