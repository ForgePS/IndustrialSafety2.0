// Type Imports
import type * as Icons from 'react-icons/tb'

export type PlanVariant = {
  id: string // Unique identifier for the plan within your application
  name: string // Display name of the plan
  description?: string // Optional description for the plan
  paymentType: 'one-off' | 'recurring' // Payment type (one-off or recurring)
  features?: string[] // Features included in the plan
  interval?: 'daily' | 'weekly' | 'monthly' | 'yearly' // Interval for recurring payments
  lineItems: {
    priceId: string // Stripe price ID or unique identifier
    name: string // Name of the line item (e.g., "Basic", "Pro", "Addon")
    cost: number // Cost of the item
    description?: string // Optional description for the line item
  }[]
}

export type Plan = {
  id: string // Unique identifier for the product
  name: string // Display name of the product
  description: string // Description of the product
  currency: string // Currency code (e.g., USD)
  icon?: keyof typeof Icons // Optional icon for the product
  badge?: string // Optional badge (e.g., "Popular", "Value")
  highlighted?: boolean // Optional flag to highlight the product
  couponId?: string // Optional coupon ID
  variants: PlanVariant[] // Variants of the product
} & (
  | {
      // eslint-disable-next-line lines-around-comment
      // Subscriptions
      features: string[]
      variants: (PlanVariant & { features?: never; paymentType: 'recurring' })[]
    }
  | {
      // eslint-disable-next-line lines-around-comment
      // One-time purchases
      features?: never
      variants: (PlanVariant & { features: string[]; paymentType: 'one-off' })[]
    }
)
