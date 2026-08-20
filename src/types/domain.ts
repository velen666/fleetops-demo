/**
 * FleetOps demo domain types.
 * Based on: BPD-INCIDENT-LOOP, incident_lifecycle, EPIC-03/04/05 specs,
 * incident_types_catalog, incident_causes_catalog, RBAC matrix.
 */

// ─── Sites & Robots ────────────────────────────────────────────────────────

export interface Site {
  readonly id: string
  readonly name: string
  readonly address: string
  readonly timezone: string
}

export interface Robot {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly vendor: string
  readonly siteId: string
  readonly status: 'ACTIVE' | 'MAINTENANCE' | 'DISABLED'
  /** Каноническая зона базирования (ТЗ §9: зона едина на всех вкладках). */
  readonly zoneName: string | null
  readonly serialNumber: string | null
  /** Экземпляр системы управления парком, из которого поступают данные. */
  readonly sourceInstanceId: string | null
}

// ─── Events (EPIC-08) ──────────────────────────────────────────────────────

export type EventSource = 'RMS' | 'FMS' | 'WMS' | 'ITSM' | 'MANUAL'

/**
 * Экземпляр источника данных на объекте (ТЗ §9): тип + конкретная система.
 * Технические события — только RMS/FMS/RCS; WMS — только процессные события
 * задания; MANUAL — ручное подтверждение человека.
 */
export interface SourceInstance {
  readonly id: string
  readonly kind: 'FLEET_MANAGEMENT' | 'WAREHOUSE' | 'MANUAL'
  readonly systemName: string
  readonly siteId: string
  readonly vendor: string | null
}
export type EventProcessingStatus =
  | 'RECEIVED'
  | 'NORMALIZED'
  | 'INCIDENT_CREATED'
  | 'LINKED_TO_INCIDENT'
  | 'DUPLICATE_REJECTED'
  | 'INFORMATIONAL'
  | 'NEEDS_CLASSIFICATION'
  | 'ERROR'

export interface OperationalEvent {
  readonly id: string
  readonly timestamp: string
  readonly receivedAt: string
  readonly source: EventSource
  /** Конкретный экземпляр источника (HIK RMS · Обухово, WMS · Подольск, Оператор смены …). */
  readonly sourceInstanceId: string | null
  readonly siteId: string
  readonly robotId: string | null
  readonly rawCode: string
  readonly rawMessage: string
  /** Русская интерпретация сигнала FleetOps человеческим языком (ТЗ §9). */
  readonly humanInterpretation: string
  readonly rawPayload: Record<string, unknown>
  readonly normalizedType: string
  readonly incidentTypeCode: string | null
  readonly processingStatus: EventProcessingStatus
  readonly incidentId: string | null
  readonly ruleApplied: string | null
  readonly confidence: number
  readonly isDuplicate: boolean
}

// ─── Incidents (EPIC-02) ───────────────────────────────────────────────────

export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'READY_TO_CLOSE' | 'CLOSED'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentSourceKind = 'MANUAL' | 'AUTOMATIC'

export interface Incident {
  readonly id: string
  readonly incidentNumber: string
  readonly title: string
  readonly description: string
  readonly siteId: string
  readonly zoneName: string | null
  readonly robotId: string | null
  readonly incidentTypeCode: string
  readonly status: IncidentStatus
  readonly severity: IncidentSeverity
  readonly sourceKind: IncidentSourceKind
  readonly detectedAt: string
  readonly openedAt: string
  readonly closedAt: string | null
  readonly coordinatorId: string | null
  readonly coordinatorName: string | null
  readonly causeCode: string | null
  readonly causeMaturity: 'NONE' | 'PRIMARY' | 'REFINED' | 'FINAL'
  readonly hasDowntime: boolean
  readonly downtimeConfirmed: boolean
  readonly recoveryConfirmed: boolean
  readonly downtimeSeconds: number
  readonly lossRubles: number
  readonly reactionSlaSeconds: number | null
  readonly reactionSlaMet: boolean | null
  readonly recoverySlaSeconds: number | null
  readonly recoverySlaMet: boolean | null
}

// ─── Incident Types (catalog) ───────────────────────────────────────────────

export interface IncidentType {
  readonly code: string
  readonly name: string
  readonly category: string
  readonly defaultSeverity: IncidentSeverity
}

// ─── Causes (catalog) ──────────────────────────────────────────────────────

export interface CauseCategory {
  readonly code: string
  readonly name: string
}

export interface CauseItem {
  readonly code: string
  readonly name: string
  readonly categoryCode: string
  readonly responsibilityZone: string
  /** ТЗ §1: причина объясняет «почему произошло» — обязательные атрибуты доказуемости. */
  readonly targetObject?: string
  readonly failureMechanism?: string
  readonly typicalEvidence?: readonly string[]
  readonly correctiveAction?: string
  readonly ownerRole?: string
}

export type CauseMaturity = 'PRIMARY' | 'REFINED' | 'FINAL'

export interface CauseClassification {
  readonly incidentId: string
  readonly versions: CauseVersion[]
  readonly currentMaturity: CauseMaturity | 'NONE'
}

export interface CauseVersion {
  readonly sequence: number
  readonly causeCode: string
  readonly causeName: string
  readonly maturity: CauseMaturity
  readonly classifiedBy: string
  readonly classifiedAt: string
  readonly comment: string | null
  readonly responsibilityZone: string
  readonly evidence: string[]
}

// ─── Downtime (EPIC-05 + TZ v1.6 §13/§31) ──────────────────────────────────

export type DowntimeConfirmationStatus =
  'PROPOSED' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'ADJUSTED' | 'REJECTED'
export type DowntimeIntervalState = 'OPEN' | 'CLOSED'

/** Характер простоя — что именно было недоступно и в каком режиме (ТЗ §31). */
export type DowntimeKind =
  | 'UNPLANNED_TECHNICAL'
  | 'INFRASTRUCTURE'
  | 'ORGANIZATIONAL'
  | 'ACCIDENT_SAFETY'
  | 'PLANNED_MAINTENANCE'

/** Объект недоступности (ТЗ §31). */
export type DowntimeImpactObject = 'ROBOT' | 'ROBOT_GROUP' | 'ZONE' | 'SITE' | 'PROCESS'

/** Модель экономического влияния (ТЗ §3: резерв/компенсация). */
export interface DowntimeImpactModel {
  readonly backupRobotId: string | null
  readonly compensation: 'NONE' | 'BACKUP_ROBOT' | 'PARTIAL'
  /** Основание корректировки учёта, когда техническая и учётная недоступность различаются. */
  readonly adjustmentBasis: string | null
}

export interface Downtime {
  readonly id: string
  readonly incidentId: string
  readonly siteId: string
  readonly robotId: string | null
  readonly zoneName: string | null
  readonly downtimeType: 'FULL' | 'PARTIAL'
  readonly confirmationStatus: DowntimeConfirmationStatus
  readonly confirmedBy: string | null
  readonly confirmedAt: string | null
  readonly intervalState: DowntimeIntervalState
  readonly kind: DowntimeKind
  readonly impactObject: DowntimeImpactObject
  readonly impact: DowntimeImpactModel
  readonly startedAt: string
  readonly endedAt: string | null
  readonly calendarDurationSeconds: number
  readonly accountableDurationSeconds: number
  readonly ruleCode: string
  readonly ruleName: string
  readonly fallbackApplied: boolean
  readonly ratePerHour: number
  readonly lossRubles: number
}

// ─── Service Actions (EPIC-04) ─────────────────────────────────────────────

export type ServiceActionStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type ServiceActionResult = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'POSTPONED' | null

export interface ServiceAction {
  readonly id: string
  readonly incidentId: string
  readonly actionTypeCode: string
  readonly actionTypeName: string
  readonly description: string
  readonly status: ServiceActionStatus
  readonly result: ServiceActionResult
  readonly executorName: string | null
  readonly createdAt: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly comment: string | null
}

// ─── Recovery ──────────────────────────────────────────────────────────────

export interface RecoveryConfirmation {
  readonly incidentId: string
  readonly recoveredAt: string
  readonly confirmedBy: string
  readonly basis: 'SUCCESSFUL_ACTION' | 'NO_ACTION_EXCEPTION'
  readonly actionId: string | null
  readonly comment: string | null
}

// ─── Timeline ──────────────────────────────────────────────────────────────

export interface TimelineEntry {
  readonly id: string
  readonly incidentId: string
  readonly timestamp: string
  readonly eventType: string
  readonly summary: string
  readonly actorName: string
  readonly isAutomatic: boolean
  readonly details: Record<string, unknown> | null
}

// ─── Users ─────────────────────────────────────────────────────────────────

export interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: string
  readonly siteIds: string[]
}

// ─── Downtime Rules (EPIC-05 admin) ────────────────────────────────────────

export interface DowntimeRule {
  readonly id: string
  readonly code: string
  readonly displayName: string
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  readonly timeAccountingMode: 'CALENDAR_24X7' | 'CALENDAR_MINUS_EXCLUSIONS'
  readonly scopeSiteId: string | null
  readonly scopeIncidentTypeCode: string | null
  readonly priority: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
}

// ─── Economics (EPIC-06) ──────────────────────────────────────────────────

export interface CostRate {
  readonly id: string
  readonly siteId: string
  readonly siteName: string
  readonly ratePerHour: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly currency: string
  readonly basis: string
  readonly version: number
}

export interface CostSnapshot {
  readonly downtimeId: string
  readonly incidentId: string
  readonly rateId: string
  readonly hours: number
  readonly ratePerHour: number
  readonly totalRubles: number
  readonly currency: string
  readonly formula: string
  readonly calculatedAt: string
}

// ─── Event Registration (EPIC-08) ─────────────────────────────────────────

export interface ManualEventForm {
  readonly siteId: string
  readonly zoneName: string
  readonly robotId: string | null
  readonly eventType: string
  readonly description: string
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

// ─── ТОиР (ТЗ v1.4 §19) ─────────────────────────────────────────────────

export type MaintenanceType = 'EMERGENCY' | 'PLANNED' | 'CORRECTIVE' | 'DIAGNOSTIC'
export type MaintenanceStatus =
  | 'PLANNED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'DONE'
  | 'RESULT_CONFIRMED'
  | 'CANCELLED'

export interface MaintenanceWork {
  readonly id: string
  readonly type: MaintenanceType
  readonly title: string
  readonly robotId: string
  readonly siteId: string
  readonly incidentId: string | null
  readonly executor: string
  readonly dueAt: string
  readonly completedAt: string | null
  readonly status: MaintenanceStatus
  readonly result: string | null
}
