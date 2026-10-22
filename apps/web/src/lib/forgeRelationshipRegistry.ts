import type { ForgeResourceType } from './forgeResourceRegistry'
import { isForgeResourceType } from './forgeResourceRegistry'

export type ForgeRelationshipDefinition = {
  relationshipType: string
  sourceTypes: ForgeResourceType[]
  targetTypes: ForgeResourceType[]
  reciprocalDisplay: boolean
  allowDuplicate: boolean
  archivable: boolean
  requiredManagePermission?: string
}

const OPERATIONAL_LINK_TYPES: ForgeResourceType[] = [
  'observation',
  'risk_register',
  'jsa',
  'corrective_action',
  'task',
  'incident',
  'inspection',
  'inspection_finding',
  'asset',
  'loto_procedure',
  'loto_application',
  'training_course',
  'training_assignment',
  'support_ticket'
]

const RELATIONSHIP_DEFINITIONS: ForgeRelationshipDefinition[] = [
  {
    relationshipType: 'involves_asset',
    sourceTypes: ['incident', 'observation', 'risk_register', 'jsa'],
    targetTypes: ['asset'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'involves_person',
    sourceTypes: ['observation', 'jsa'],
    targetTypes: ['personnel'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'identified_risk',
    sourceTypes: ['incident', 'inspection_finding', 'observation', 'jsa'],
    targetTypes: ['risk_register'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'generated_capa',
    sourceTypes: ['incident', 'inspection_finding', 'observation', 'risk_register', 'jsa'],
    targetTypes: ['corrective_action'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'implemented_by',
    sourceTypes: ['corrective_action'],
    targetTypes: ['task'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'related',
    sourceTypes: OPERATIONAL_LINK_TYPES,
    targetTypes: OPERATIONAL_LINK_TYPES,
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'equipment',
    sourceTypes: ['incident', 'inspection', 'inspection_finding', 'corrective_action', 'task', 'loto_procedure', 'loto_application'],
    targetTypes: ['asset'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'corrects',
    sourceTypes: ['corrective_action', 'task'],
    targetTypes: ['incident', 'inspection_finding', 'inspection'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'caused_by',
    sourceTypes: ['incident', 'corrective_action', 'inspection_finding'],
    targetTypes: ['incident', 'asset', 'inspection_finding', 'corrective_action'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'references',
    sourceTypes: OPERATIONAL_LINK_TYPES,
    targetTypes: OPERATIONAL_LINK_TYPES,
    reciprocalDisplay: true,
    allowDuplicate: true,
    archivable: true
  },
  {
    relationshipType: 'parent',
    sourceTypes: OPERATIONAL_LINK_TYPES,
    targetTypes: OPERATIONAL_LINK_TYPES,
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'child',
    sourceTypes: OPERATIONAL_LINK_TYPES,
    targetTypes: OPERATIONAL_LINK_TYPES,
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  },
  {
    relationshipType: 'evidence_of',
    sourceTypes: OPERATIONAL_LINK_TYPES,
    targetTypes: OPERATIONAL_LINK_TYPES,
    reciprocalDisplay: true,
    allowDuplicate: true,
    archivable: true
  },
  {
    relationshipType: 'source',
    sourceTypes: ['corrective_action', 'task', 'training_assignment'],
    targetTypes: ['incident', 'inspection', 'inspection_finding', 'corrective_action', 'support_ticket'],
    reciprocalDisplay: true,
    allowDuplicate: false,
    archivable: true
  }
]

const DEFINITION_BY_TYPE = new Map(
  RELATIONSHIP_DEFINITIONS.map(item => [item.relationshipType, item])
)

export const FORGE_RELATIONSHIP_TYPES: string[] = RELATIONSHIP_DEFINITIONS.map(
  item => item.relationshipType
)

export const getRelationshipDefinition = (
  relationshipType: string
): ForgeRelationshipDefinition | null => {
  const key = relationshipType.trim().toLowerCase()
  return DEFINITION_BY_TYPE.get(key) || null
}

export const isAllowedRelationship = (
  sourceType: string,
  targetType: string,
  relationshipType: string
): boolean => {
  if (!isForgeResourceType(sourceType) || !isForgeResourceType(targetType)) return false
  const definition = getRelationshipDefinition(relationshipType)
  if (!definition) return false
  if (sourceType === targetType && relationshipType === 'related') {
    // Same-record self-links are never valid; same-type cross-record related is allowed.
  }
  return (
    definition.sourceTypes.includes(sourceType) &&
    definition.targetTypes.includes(targetType)
  )
}
