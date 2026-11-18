'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  acceptForgeAiRecommendation,
  completeForgeAiRecommendation,
  decideForgeAiRecommendation,
  dismissForgeAiRecommendation,
  generateForgeAiRecommendations,
  submitForgeAiRecommendation,
  verifyForgeAiRecommendationManually,
  verifyForgeAiRecommendations
} from '@/lib/forgeAiRecommendations'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { message?: string; error?: string }

const id = z.string().uuid()
const note = z.string().trim().max(2000)

const reviewer = async () => {
  const context = await requireTenantPermission('forge_ai.review_recommendations')

  return {
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    permissionByKey: new Map(context.access.effective.map(item => [item.permissionKey, item]))
  }
}

const run = async (task: () => Promise<Result>): Promise<Result> => {
  try {
    const result = await task()

    revalidatePath('/ai/recommendations')
    revalidatePath('/ai/command-center')

    return result.error ? { error: result.error } : { message: result.message }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The recommendation could not be updated.' }
  }
}

export const refreshForgeAiRecommendations = async (): Promise<Result> =>
  run(async () => {
    const context = await reviewer()
    const generated = await generateForgeAiRecommendations({ organizationId: context.organizationId, actorUserId: context.userId })
    const verified = await verifyForgeAiRecommendations({ organizationId: context.organizationId })

    return {
      message: `${generated.created} new recommendation(s), ${generated.superseded} cleared, ${verified.verified} verified.`
    }
  })

export const acceptRecommendation = async (recommendationId: string, text = ''): Promise<Result> =>
  run(async () => acceptForgeAiRecommendation({ ...(await reviewer()), recommendationId: id.parse(recommendationId), note: note.parse(text) }))

export const submitRecommendation = async (
  recommendationId: string,
  edits: { title?: string; description?: string } = {}
): Promise<Result> =>
  run(async () =>
    submitForgeAiRecommendation({
      ...(await reviewer()),
      recommendationId: id.parse(recommendationId),
      edits: z.object({ title: z.string().max(200).optional(), description: z.string().max(4000).optional() }).parse(edits)
    })
  )

export const decideRecommendation = async (recommendationId: string, decision: 'approve' | 'reject', reason = ''): Promise<Result> =>
  run(async () =>
    decideForgeAiRecommendation({
      ...(await reviewer()),
      recommendationId: id.parse(recommendationId),
      decision: z.enum(['approve', 'reject']).parse(decision),
      reason: note.parse(reason)
    })
  )

export const dismissRecommendation = async (recommendationId: string, reason: string): Promise<Result> =>
  run(async () => dismissForgeAiRecommendation({ ...(await reviewer()), recommendationId: id.parse(recommendationId), reason: note.parse(reason) }))

export const completeRecommendation = async (recommendationId: string, text: string): Promise<Result> =>
  run(async () => completeForgeAiRecommendation({ ...(await reviewer()), recommendationId: id.parse(recommendationId), note: note.parse(text) }))

export const verifyRecommendation = async (recommendationId: string, outcome: 'effective' | 'ineffective', text: string): Promise<Result> =>
  run(async () =>
    verifyForgeAiRecommendationManually({
      ...(await reviewer()),
      recommendationId: id.parse(recommendationId),
      outcome: z.enum(['effective', 'ineffective']).parse(outcome),
      note: note.parse(text)
    })
  )
