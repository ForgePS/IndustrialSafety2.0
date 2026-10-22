'use server'

import { revalidatePath } from 'next/cache'
import { createAcknowledgement } from '@/lib/forgeAcknowledgements'
import { addRecordComment } from '@/lib/forgeComments'
import { archiveRecordLink, createRecordLink } from '@/lib/forgeRecordLinks'

const text = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const revalidateResource = (resourceType: string, resourceId: string) => {
  if (resourceType === 'corrective_action' && resourceId) {
    revalidatePath('/corrective-actions/' + resourceId)
    revalidatePath('/corrective-actions')
  }
  if (resourceType === 'task' && resourceId) {
    revalidatePath('/tasks/' + resourceId)
    revalidatePath('/tasks')
  }
  if (resourceType === 'incident' && resourceId) {
    revalidatePath('/incidents/' + resourceId)
    revalidatePath('/incidents')
  }
  if (resourceType === 'inspection' && resourceId) {
    revalidatePath('/inspections/' + resourceId)
    revalidatePath('/inspections')
  }
  if (resourceType === 'asset' && resourceId) {
    revalidatePath('/assets/' + resourceId)
    revalidatePath('/assets')
  }
}

export const addSharedCommentAction = async (formData: FormData) => {
  const resourceType = text(formData.get('resourceType'))
  const resourceId = text(formData.get('resourceId'))
  const body = text(formData.get('body'))

  const result = await addRecordComment({ resourceType, resourceId, body })
  if (result.error) throw new Error(result.error)

  revalidateResource(resourceType, resourceId)
}

export const createSharedLinkAction = async (formData: FormData) => {
  const sourceResourceType = text(formData.get('sourceResourceType'))
  const sourceResourceId = text(formData.get('sourceResourceId'))
  const targetResourceType = text(formData.get('targetResourceType'))
  const targetResourceId = text(formData.get('targetResourceId'))
  const relationshipType = text(formData.get('relationshipType')) || 'related'

  const result = await createRecordLink({
    sourceResourceType,
    sourceResourceId,
    targetResourceType,
    targetResourceId,
    relationshipType
  })
  if (result.error) throw new Error(result.error)

  revalidateResource(sourceResourceType, sourceResourceId)
  revalidateResource(targetResourceType, targetResourceId)
}

export const archiveSharedLinkAction = async (formData: FormData) => {
  const linkId = text(formData.get('linkId'))
  const resourceType = text(formData.get('resourceType'))
  const resourceId = text(formData.get('resourceId'))

  const result = await archiveRecordLink({ linkId })
  if (result.error) throw new Error(result.error)

  revalidateResource(resourceType, resourceId)
}

export const acknowledgeRecordAction = async (formData: FormData) => {
  const resourceType = text(formData.get('resourceType'))
  const resourceId = text(formData.get('resourceId'))
  const acknowledgementType = text(formData.get('acknowledgementType')) || 'reviewed'

  const result = await createAcknowledgement({
    resourceType,
    resourceId,
    acknowledgementType
  })
  if (result.error) throw new Error(result.error)

  revalidateResource(resourceType, resourceId)
}
