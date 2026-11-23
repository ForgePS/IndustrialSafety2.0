/**
 * Port slice 18: the company permit settings, with the same ranges the database checks
 * (forge_permit_settings in 20261123100000_s18_permits.sql). Shared by the settings form and the save action.
 */

type NumberField = { key: string; kind: 'number'; label: string; help?: string; min: number; max: number; integer?: boolean; step?: number; group: string }
type BooleanField = { key: string; kind: 'boolean'; label: string; help?: string; group: string }

export type SettingsField = NumberField | BooleanField

export const SETTINGS_FIELDS: SettingsField[] = [
  { key: 'confined_space_max_hours', kind: 'number', label: 'Confined space: longest permit (hours)', min: 1, max: 24, integer: true, group: 'How long a permit can run' },
  { key: 'hot_work_max_hours', kind: 'number', label: 'Hot work: longest permit (hours)', min: 1, max: 24, integer: true, group: 'How long a permit can run' },
  { key: 'heights_max_hours', kind: 'number', label: 'Working at heights: longest permit (hours)', min: 1, max: 24, integer: true, group: 'How long a permit can run' },
  { key: 'electrical_max_hours', kind: 'number', label: 'Electrical: longest permit (hours)', min: 1, max: 24, integer: true, group: 'How long a permit can run' },
  { key: 'o2_min', kind: 'number', label: 'Oxygen minimum (%)', min: 16, max: 21, step: 0.1, group: 'Gas test limits' },
  { key: 'o2_max', kind: 'number', label: 'Oxygen maximum (%)', min: 21, max: 25, step: 0.1, group: 'Gas test limits' },
  { key: 'lel_max', kind: 'number', label: 'LEL limit, confined space (%)', min: 0, max: 25, step: 0.1, group: 'Gas test limits' },
  { key: 'hot_work_lel_max', kind: 'number', label: 'LEL limit, hot work (%)', min: 0, max: 25, step: 0.1, group: 'Gas test limits' },
  { key: 'h2s_max', kind: 'number', label: 'H2S limit (ppm)', min: 0, max: 100, step: 0.1, group: 'Gas test limits' },
  { key: 'co_max', kind: 'number', label: 'CO limit (ppm)', min: 0, max: 200, step: 0.1, group: 'Gas test limits' },
  {
    key: 'gas_test_valid_minutes',
    kind: 'number',
    label: 'A gas test counts for (minutes)',
    help: 'After this, test again before issuing, resuming or letting anyone in.',
    min: 5,
    max: 480,
    integer: true,
    group: 'Gas test limits'
  },
  {
    key: 'fire_watch_minutes',
    kind: 'number',
    label: 'Fire watch after hot work (minutes)',
    help: 'OSHA asks for at least 30 minutes; NFPA 51B asks for 60.',
    min: 30,
    max: 240,
    integer: true,
    group: 'Hot work'
  },
  { key: 'allow_self_approval', kind: 'boolean', label: 'Let people approve their own permit requests', group: 'Approval' },
  { key: 'require_training', kind: 'boolean', label: 'Block approval when someone on the permit is missing required training', group: 'Approval' }
]
