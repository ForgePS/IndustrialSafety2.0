'use server'

// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import { jwtVerify } from 'jose'
import type { User } from '@supabase/supabase-js'
import type { Stripe } from 'stripe'

// Type Imports
import type { PlanVariant } from './types/billingConfigTypes'

// Util Imports
import { getBillingData } from './utils/getBillingData'
import { createSession, encodedKey } from './lib/session'

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

export async function createCheckoutSession(
  planId: string,
  variantDetails: PlanVariant,
  paymentProvider: string,
  userRecord: User,
  requestUrl: string
) {
  if (!planId) {
    throw new Error('planId is required')
  }

  if (paymentProvider === 'stripe') {
    try {
      // Parse the request origin
      const { origin } = new URL(requestUrl)

      // Retrieve the price object from Stripe
      const price = await stripe.prices.retrieve(planId)

      // Determine the mode based on the price type
      const mode: Stripe.Checkout.SessionCreateParams.Mode = price.recurring ? 'subscription' : 'payment'

      const isSubscription = mode === 'subscription'

      const customerCreation = isSubscription ? {} : { customer_creation: 'always' }

      // Create a Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        ui_mode: 'embedded',
        line_items: [
          {
            price: planId,
            quantity: 1
          }
        ],
        mode,
        metadata: {
          user_id: userRecord?.id,
          user_email: userRecord?.email,
          plan_variant: variantDetails.name,
          interval: variantDetails.interval,
          cost: variantDetails.lineItems[0].cost.toString()
        },
        ...customerCreation,
        return_url: `${origin}/thank-you`
      })

      return { clientSecret: session.client_secret }
    } catch (error) {
      console.error('Stripe error:', error)
      throw new Error('An error occurred while creating the checkout session')
    }
  }

  if (paymentProvider === 'lemon_squeezy') {
    try {
      const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`
        },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                custom: {
                  user_id: userRecord?.id,
                  plan_variant: variantDetails.name,
                  interval: variantDetails.interval,
                  cost: variantDetails.lineItems[0].cost.toString()
                }
              },
              product_options: {
                enabled_variants: [planId.toString()], // Only enable this variant
                redirect_url: 'http://localhost:3000/thank-you'
              }
            },
            relationships: {
              store: {
                data: {
                  type: 'stores',
                  id: process.env.LEMON_SQUEEZY_STORE_ID!.toString()
                }
              },
              variant: {
                data: {
                  type: 'variants',
                  id: planId.toString()
                }
              }
            }
          }
        })
      })

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      const responseData = await response.json()
      const checkoutUrl = responseData.data.attributes.url

      return { checkoutUrl }
    } catch (error) {
      console.error('Lemon Squeezy error:', error)
      throw new Error('An error occurred while creating the checkout session')
    }
  }

  throw new Error('Unsupported payment provider')
}

export async function createBillingPortalSession(plans: any[], customerId: string, originUrl: string) {
  try {
    // Get subscription plans and price IDs
    const subscriptionPlans = getBillingData({ plans })?.map((plan: { variants: any[]; id: any }) => {
      const subscriptionVariants = plan.variants
        .filter(variant => variant.paymentType === 'recurring') // Only include recurring plans
        .flatMap(variant => variant.lineItems.map((lineItem: { priceId: string }) => lineItem.priceId)) // Extract all price IDs

      return {
        product: plan.id,
        prices: subscriptionVariants
      }
    })

    // Create Stripe Billing Portal Configuration
    const configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Manage your subscriptions'
      },
      features: {
        customer_update: {
          allowed_updates: ['address', 'email', 'phone'],
          enabled: true
        },
        invoice_history: {
          enabled: true
        },
        payment_method_update: {
          enabled: true
        },
        subscription_update: {
          enabled: true,
          proration_behavior: 'always_invoice',
          products: subscriptionPlans,
          default_allowed_updates: ['price']
        },
        subscription_cancel: {
          enabled: true,
          cancellation_reason: {
            enabled: true,
            options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other']
          },
          mode: 'at_period_end',
          proration_behavior: 'none'
        }
      },
      default_return_url: `${originUrl}/thank-you`
    })

    // Create a Stripe Billing Portal Session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: configuration.id,
      return_url: `${originUrl}/dashboard/billing` // URL to redirect after customer manages subscription
    })

    return {
      url: portalSession.url // Return the portal session URL
    }
  } catch (error) {
    console.error('Error creating billing portal session:', error)
    throw new Error('Failed to create billing portal session')
  }
}

export async function getSubscribeData(orderId: string | null, paymentType: string, billingProvider: string) {
  try {
    if (!orderId) {
      throw new Error('Order ID is required')
    }

    if (billingProvider === 'stripe') {
      if (paymentType === 'recurring') {
        // Fetch subscription details for the customer from Stripe
        const subscriptions = await stripe.subscriptions.retrieve(orderId)

        const plainSubscriptions = JSON.parse(JSON.stringify(subscriptions))

        return {
          status: 200,
          data: { subscriptions: plainSubscriptions }
        }
      } else {
        // Fetch charges for the customer from Stripe
        const charge = await stripe.charges.list({
          customer: orderId
        })

        if (!charge.data.length) {
          throw new Error('No charges found for this customer')
        }

        return {
          status: 200,
          data: charge.data[0]
        }
      }
    }

    if (billingProvider === 'lemon_squeezy') {
      const response = await fetch(
        `https://api.lemonsqueezy.com/v1/${paymentType === 'recurring' ? 'subscriptions' : 'orders'}/${orderId}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`
          }
        }
      )

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      const data = await response.json()

      return {
        status: 200,
        data
      }
    }

    // If billing provider is neither Stripe nor Lemon Squeezy, throw an error
    throw new Error('Unsupported billing provider')
  } catch (error) {
    console.error('Error fetching billing details:', error)

    return {
      status: 500,
      error: error || 'Failed to retrieve billing details'
    }
  }
}

export async function saveCheckoutData(reqData?: any) {
  try {
    // Check for required data
    if (!reqData) {
      throw new Error('Plan data is required')
    }

    // Create session with the provided data
    await createSession('checkoutData', reqData)

    return {
      status: 200,
      message: 'Checkout data saved successfully'
    }
  } catch (error) {
    console.error('Error saving checkout data:', error)

    throw new Error('An error occurred while saving checkout data')
  }
}

// Server Action: Fetch Checkout Data
export async function fetchCheckoutData() {
  try {
    const sessionCookies = await cookies()
    const cookie = sessionCookies.get('checkoutData')

    if (!cookie) {
      return {
        status: 404,
        data: null
      }
    }

    // Decode and verify the JWT
    const { payload } = await jwtVerify(cookie.value, encodedKey, {
      algorithms: ['HS256'] // Specify the algorithm used for signing
    })

    const checkoutData = JSON.parse(JSON.stringify(payload.data))

    return {
      status: 200,
      data: checkoutData
    }
  } catch (error) {
    console.error('Error fetching checkout data:', error)

    throw new Error('An error occurred while fetching checkout data')
  }
}
