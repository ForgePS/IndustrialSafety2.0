import { PLAN_KINDS } from '@/lib/forgeEmergencyRules'

/** Port slice 14: tab lists for the Emergency Plans and Emergency Alerts sections. */
export const PLAN_TABS = [
  ...PLAN_KINDS.map(kind => ({ key: kind.key, label: kind.plural, href: '/emergency?kind=' + kind.key })),
  { key: 'archived', label: 'Archived', href: '/emergency?archived=1' }
]

export const alertTabs = ({ canSend, canManageTemplates }: { canSend: boolean; canManageTemplates: boolean }) => [
  { key: 'alerts', label: 'Alerts', href: '/emergency/alerts' },
  ...(canSend ? [{ key: 'new', label: 'Send an alert', href: '/emergency/alerts/new' }] : []),
  ...(canManageTemplates ? [{ key: 'templates', label: 'Templates', href: '/emergency/alerts/templates' }] : [])
]
