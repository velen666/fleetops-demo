/**
 * Русские локализации статусов и кодов для demo.
 * По ТЗ v1.4 §13: машинные коды — вторичный текст, не основной.
 */

export const INCIDENT_STATUS_RU: Record<string, string> = {
  OPEN: 'Новый',
  IN_PROGRESS: 'В работе',
  WAITING: 'Ожидает сервисных работ',
  READY_TO_CLOSE: 'Готов к закрытию',
  CLOSED: 'Закрыт',
}

export const INCIDENT_STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-warning/15 text-warning',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  WAITING: 'bg-muted text-muted-foreground',
  READY_TO_CLOSE: 'bg-accent/15 text-accent',
  CLOSED: 'bg-success/15 text-success',
}

export const SEVERITY_RU: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
}

export const CAUSE_MATURITY_RU: Record<string, string> = {
  PRIMARY: 'Предварительная',
  REFINED: 'Уточнённая',
  FINAL: 'Подтверждённая',
  NONE: 'Не определена',
}

export const DOWNTIME_STATUS_RU: Record<string, string> = {
  PROPOSED: 'Предложен',
  PENDING_CONFIRMATION: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждён',
  ADJUSTED: 'Скорректирован',
  REJECTED: 'Отклонён',
}

export const DOWNTIME_STATUS_CLASS: Record<string, string> = {
  PROPOSED: 'bg-warning/15 text-warning',
  PENDING_CONFIRMATION: 'bg-warning/15 text-warning',
  CONFIRMED: 'bg-success/15 text-success',
  ADJUSTED: 'bg-accent/15 text-accent',
  REJECTED: 'bg-destructive/15 text-destructive',
}

export const INTERVAL_STATUS_RU: Record<string, string> = {
  OPEN: 'Открыт',
  CLOSED: 'Закрыт',
}

/** Состояния парка (ТЗ v2.0 §5.2) — ровно одно на единицу. */
export const FLEET_STATE_RU: Record<string, string> = {
  WORKING: 'Работает в зоне',
  RESERVE: 'Готов к резерву',
  ASSIGNED_REPLACE: 'Назначен на замену',
  CHARGING: 'На зарядке',
  EMERGENCY_STOP: 'Аварийная остановка / эвакуация',
  DIAGNOSTICS: 'Диагностика',
  AWAITING_REPAIR: 'Ожидает ремонта / запчастей',
  IN_REPAIR: 'В ремонте',
  TEST_RUN: 'Контрольный запуск',
  RETURNED_TO_PARK: 'Возвращён в парк',
}

export const FLEET_STATE_CLASS: Record<string, string> = {
  WORKING: 'bg-success/15 text-success',
  RESERVE: 'bg-accent/15 text-accent',
  ASSIGNED_REPLACE: 'bg-primary/15 text-primary',
  CHARGING: 'bg-muted text-muted-foreground',
  EMERGENCY_STOP: 'bg-destructive/15 text-destructive',
  DIAGNOSTICS: 'bg-warning/15 text-warning',
  AWAITING_REPAIR: 'bg-warning/15 text-warning',
  IN_REPAIR: 'bg-warning/15 text-warning',
  TEST_RUN: 'bg-primary/15 text-primary',
  RETURNED_TO_PARK: 'bg-success/15 text-success',
}

/** Два типа интервала (ТЗ v2.0 §5.3). */
export const INTERVAL_TYPE_RU: Record<string, string> = {
  OPERATIONAL_IMPACT: 'Операционное влияние',
  TECHNICAL_UNAVAILABLE: 'Техническая недоступность',
}

/** Характер простоя (ТЗ §31): что именно было недоступно и в каком режиме. */
export const DOWNTIME_KIND_RU: Record<string, string> = {
  UNPLANNED_TECHNICAL: 'Внеплановый технический',
  INFRASTRUCTURE: 'Инфраструктурный',
  ORGANIZATIONAL: 'Организационный / процессный',
  ACCIDENT_SAFETY: 'Аварийный / безопасность',
  PLANNED_MAINTENANCE: 'Плановое обслуживание',
}

export const DOWNTIME_IMPACT_OBJECT_RU: Record<string, string> = {
  ROBOT: 'Робот',
  ROBOT_GROUP: 'Группа роботов',
  ZONE: 'Зона',
  SITE: 'Объект',
  PROCESS: 'Процесс',
}

export const COMPENSATION_RU: Record<string, string> = {
  NONE: 'Без компенсации',
  BACKUP_ROBOT: 'Резервный робот',
  PARTIAL: 'Частичная компенсация',
}

export const TIMELINE_EVENT_RU: Record<string, string> = {
  EVENT: 'Событие',
  CREATED: 'Создание инцидента',
  ASSIGNED: 'Назначение координатора',
  SAFETY: 'Безопасность',
  SUBSTITUTION: 'Замещение',
  OBSERVATION: 'Наблюдение',
  CAUSE: 'Причина',
  ACTION_CREATED: 'Сервисное действие',
  ACTION_COMPLETED: 'Результат действия',
  RECOVERY: 'Восстановление',
  DOWNTIME: 'Простой',
  CLOSED: 'Закрытие',
  REOPENED: 'Переоткрытие',
  SCENARIO: 'Шаг сценария',
}
export const EVENT_STATUS_RU: Record<string, string> = {
  RECEIVED: 'Принято',
  NORMALIZED: 'Нормализовано',
  INCIDENT_CREATED: 'Создан инцидент',
  LINKED_TO_INCIDENT: 'Привязан к инциденту',
  DUPLICATE_REJECTED: 'Отброшен как дубликат',
  INFORMATIONAL: 'Информационное',
  NEEDS_CLASSIFICATION: 'Требует разбора',
  ERROR: 'Ошибка обработки',
}

export const EVENT_STATUS_CLASS: Record<string, string> = {
  INCIDENT_CREATED: 'bg-success/15 text-success',
  LINKED_TO_INCIDENT: 'bg-success/15 text-success',
  NEEDS_CLASSIFICATION: 'bg-warning/15 text-warning',
  INFORMATIONAL: 'bg-muted text-muted-foreground',
  DUPLICATE_REJECTED: 'bg-muted text-muted-foreground',
  ERROR: 'bg-destructive/15 text-destructive',
}

export const ACTION_STATUS_RU: Record<string, string> = {
  CREATED: 'Назначено',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнено',
  CANCELLED: 'Отменено',
}

export const ACTION_STATUS_CLASS: Record<string, string> = {
  CREATED: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-success/15 text-success',
  CANCELLED: 'bg-destructive/15 text-destructive',
}

export const ACTION_RESULT_RU: Record<string, string> = {
  SUCCESS: 'Результат подтверждён',
  PARTIAL_SUCCESS: 'Частично',
  FAILURE: 'Неуспешно',
  POSTPONED: 'Отложено',
}

export const RESPONSIBILITY_ZONE_RU: Record<string, string> = {
  SERVICE: 'Сервис',
  OPERATIONS: 'Эксплуатация склада',
  IT: 'ИТ-инфраструктура',
  INFRASTRUCTURE: 'Инфраструктура объекта',
  VENDOR: 'Вендор',
  UNKNOWN: 'Не определена',
}

export const MAINTENANCE_STATUS_RU: Record<string, string> = {
  PLANNED: 'Запланировано',
  ASSIGNED: 'Назначено',
  IN_PROGRESS: 'В работе',
  WAITING_PARTS: 'Ожидает запчастей',
  DONE: 'Выполнено',
  RESULT_CONFIRMED: 'Результат подтверждён',
  CANCELLED: 'Отменено',
}

export const MAINTENANCE_TYPE_RU: Record<string, string> = {
  EMERGENCY: 'Аварийный ремонт',
  PLANNED: 'Плановое ТО',
  CORRECTIVE: 'Корректирующая работа',
  DIAGNOSTIC: 'Диагностика',
}

/** Источник: класс → экземпляр */
export const SOURCE_INSTANCE: Record<string, Record<string, string>> = {
  'site-obh': { RMS: 'HIK RMS · Обухово', WMS: 'WMS · Обухово', MANUAL: 'Оператор смены' },
  'site-pod': { RMS: 'Fleet Manager · Подольск', WMS: 'WMS · Подольск', MANUAL: 'Оператор смены' },
  'site-dom': {
    RMS: 'Quicktron RCS · Домодедово',
    WMS: 'WMS · Домодедово',
    MANUAL: 'Оператор смены',
  },
}

export function sourceInstanceLabel(source: string, siteId: string): string {
  return SOURCE_INSTANCE[siteId]?.[source] ?? source
}
