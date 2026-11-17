'use server'

import { revalidatePath } from 'next/cache'

import { notifyFormPendingSignature, notifyFormSignRequest } from '@/lib/forgeFormNotify'
import { signLinkPath } from '@/lib/forgeFormSignRequests'
import {
  clearFormSignature,
  issueFormSignRequest,
  listEligibleSignersForField,
  revokeFormSignRequest,
  signerDisplayName,
  signFormField
} from '@/lib/forgeFormSigning'
import type { EligibleSigner } from '@/lib/forgeFormSigning'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 9: signature server actions for the submission page's signature panel. Every permission and
 * scope rule is enforced in forgeFormSigning.ts (the EHS Director gate included); these only resolve the
 * signed-in user and active company, and never redirect, because someone a sign request was issued to may
 * sign without other forms permissions.
 */

type Result = { error?: string; message?: string }

const actor = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  return { userId: context.user.id, organizationId: context.activeOrganization.id }
}

const refresh = (submissionId: string) => {
  revalidatePath('/forms')
  revalidatePath('/forms/submissions/' + submissionId)
}

const id = (value: unknown) => (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null)
const fieldKey = (value: unknown) => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null)

/** Signs a supervisor / EHS Director field in the app with the viewer's own name. */
export const signFormFieldAction = async (submissionId: string, fieldId: string, image: string): Promise<Result & { status?: string }> => {
  const who = await actor()

  if (!who) return { error: 'Sign in to sign this form.' }
  if (!id(submissionId) || !fieldKey(fieldId)) return { error: 'Form submission not found.' }

  const result = await signFormField({
    organizationId: who.organizationId,
    submissionId,
    fieldId,
    image,
    signerName: await signerDisplayName(who.userId),
    actor: { userId: who.userId },
    method: 'in_app'
  })

  if (!result.ok) return { error: result.error }

  refresh(submissionId)

  return { status: result.status, message: result.status === 'submitted' ? 'Signed. The form is now submitted.' : 'Signed.' }
}

export const clearFormSignatureAction = async (submissionId: string, fieldId: string): Promise<Result> => {
  const who = await actor()

  if (!who) return { error: 'Sign in first.' }
  if (!id(submissionId) || !fieldKey(fieldId)) return { error: 'Form submission not found.' }

  const result = await clearFormSignature({ organizationId: who.organizationId, submissionId, fieldId, actorUserId: who.userId })

  if (!result.ok) return { error: result.error }

  await notifyFormPendingSignature({ organizationId: who.organizationId, submissionId, actorUserId: who.userId })
  refresh(submissionId)

  return { message: 'Signature cleared.' }
}

export const listEligibleSignersAction = async (submissionId: string, fieldId: string): Promise<{ error?: string; signers?: EligibleSigner[] }> => {
  const who = await actor()

  if (!who) return { error: 'Sign in first.' }
  if (!id(submissionId) || !fieldKey(fieldId)) return { error: 'Form submission not found.' }

  return listEligibleSignersForField({ organizationId: who.organizationId, submissionId, fieldId, actorUserId: who.userId })
}

/** Issues a sign link. The path is returned once; the signer is notified in the app and by email when they have a login. */
export const issueSignRequestAction = async (
  submissionId: string,
  fieldId: string,
  signerKey: string
): Promise<Result & { path?: string; expiresAt?: string; notified?: boolean }> => {
  const who = await actor()

  if (!who) return { error: 'Sign in first.' }
  if (!id(submissionId) || !fieldKey(fieldId) || typeof signerKey !== 'string') return { error: 'Form submission not found.' }

  const issued = await issueFormSignRequest({ organizationId: who.organizationId, submissionId, fieldId, signerKey, actorUserId: who.userId })

  if ('error' in issued) return { error: issued.error }

  const { notified } = await notifyFormSignRequest({
    organizationId: who.organizationId,
    submissionId,
    requestId: issued.requestId,
    rawToken: issued.token,
    actorUserId: who.userId
  })

  refresh(submissionId)

  return {
    path: signLinkPath(issued.token),
    expiresAt: issued.expiresAt,
    notified,
    message: notified
      ? `Link sent to ${issued.signer.name}. Copy it now if you want to share it another way: it is shown only once.`
      : `Copy this link and send it to ${issued.signer.name}: it is shown only once.`
  }
}

export const revokeSignRequestAction = async (submissionId: string, requestId: string): Promise<Result> => {
  const who = await actor()

  if (!who) return { error: 'Sign in first.' }
  if (!id(submissionId) || !id(requestId)) return { error: 'Signature link not found.' }

  const result = await revokeFormSignRequest({ organizationId: who.organizationId, submissionId, requestId, actorUserId: who.userId })

  if (result.error) return { error: result.error }

  refresh(submissionId)

  return { message: 'Signature link cancelled.' }
}
