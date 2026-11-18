import { getSignaturePanelData } from '@/lib/forgeFormSigning'
import { getTenantContext } from '@/lib/forgeTenantContext'

import FormSignaturePanelClient from './FormSignaturePanelClient'

/**
 * Port slice 9: supervisor and EHS Director signatures on a form submission. Server component: loads the
 * submission, the viewer's permissions and open sign links itself, so a page only renders
 * <FormSignaturePanel submissionId={id} />. Renders nothing when the form has no supervisor / EHS Director
 * signature fields or the viewer may neither view the submission nor sign.
 */
export const FormSignaturePanel = async ({ submissionId }: { submissionId: string }) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const data = await getSignaturePanelData({ organizationId: context.activeOrganization.id, userId: context.user.id, submissionId })

  if (!data) return null

  return <FormSignaturePanelClient data={data} />
}

export default FormSignaturePanel
