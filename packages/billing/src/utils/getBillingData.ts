// Utility function to get the billing data based on your needs
export const getBillingData = ({ plans, planId, priceId }: { plans: any[]; planId?: string; priceId?: string }) => {
  // Filter by plan ID if provided
  if (planId) {
    plans = plans.filter(plan => plan.id === planId)[0]

    // Return null if no plan with the given ID is found
    if (!plans) {
      return null
    }

    return plans
  }

  // If priceId is provided, search for the variant containing the matching priceId
  if (priceId) {
    for (const plan of plans) {
      for (const variant of plan.variants) {
        const foundItem = variant.lineItems.find((item: { priceId: string }) => item.priceId === priceId)

        if (foundItem) {
          // Return the specific variant that contains the matching priceId
          return variant
        }
      }
    }

    return null // Return null if no variant with the given priceId is found
  }

  return plans
}
