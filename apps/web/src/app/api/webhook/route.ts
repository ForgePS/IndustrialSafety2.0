import crypto from 'crypto'

// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import { createClient } from '@repo/supabase/server'
import { getPublicPaymentProvider } from '@repo/supabase/serverHelpers'
import { getBillingData } from '@repo/billing/src/utils/getBillingData'

// Config Imports
import plans from '@configs/billingConfig'

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// Helper function to buffer the request
async function buffer(req: NextRequest) {
  // Use the .text() method to get the full body as a string
  const bodyText = await req.text()

  // Convert the body text to a buffer
  return Buffer.from(bodyText)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: paymentProvider } = await getPublicPaymentProvider()

  try {
    if (paymentProvider?.value === 'lemon_squeezy') {
      // Get the raw body as a buffer
      const rawBody = await buffer(req)

      // Check signature
      const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SIGNATURE!

      // Use HMAC-SHA256 since the signature is 32 bytes long
      const hmac = crypto.createHmac('sha256', secret)

      // Calculate the digest as a buffer directly from the raw body (without cloning or text conversion)
      const digest = hmac.update(rawBody).digest()

      // Get the signature from the headers and ensure it's in hex format
      const signature = Buffer.from(req.headers.get('X-Signature') || '', 'hex')

      if (digest.length !== signature.length) {
        throw new Error('Invalid signature: Length mismatch')
      }

      if (!crypto.timingSafeEqual(digest, signature)) {
        throw new Error('Invalid signature.')
      }

      const payload = JSON.parse(rawBody.toString())
      const eventName = payload.meta.event_name

      if (eventName === 'order_created' && payload.meta.custom_data.order_type === 'one-off') {
        const { error } = await supabase.from('billing').insert({
          user_id: payload.meta.custom_data.user_id,
          email: payload.meta.custom_data.user_email,
          billing_provider: paymentProvider.value,
          status: 'success',
          order_type: 'one-off',
          order_id: payload.data.id,
          payment_email: payload.data.attributes.user_email,
          plan_variant: payload.meta.custom_data.plan_variant,
          interval: null,
          cost: payload.data.attributes.first_order_item.price / 100,
          currency: payload.data.attributes.currency
        })

        if (error) {
          console.error('Error inserting data:', error)

          return Response.json({ message: 'Error inserting data' }, { status: 500 })
        }
      }

      if (eventName === 'subscription_created' && payload.meta.custom_data.order_type === 'subscription') {
        // Get the cost using the priceId from the payload
        const matchedCost = getBillingData({
          plans,
          priceId: String(payload.data.attributes.variant_id)
        })

        const { error } = await supabase.from('billing').insert({
          user_id: payload.meta.custom_data.user_id,
          email: payload.meta.custom_data.user_email,
          billing_provider: paymentProvider.value,
          status: 'success',
          order_type: 'subscription',
          order_id: payload.data.id,
          payment_email: payload.data.attributes.user_email,
          plan_variant: payload.meta.custom_data.plan_variant,
          interval: payload.meta.custom_data.interval,
          cost: matchedCost?.lineItems[0].cost,
          currency: payload.data.attributes
        })

        if (error) {
          console.error('Error inserting data:', error)

          return Response.json({ message: 'Error inserting data' }, { status: 500 })
        }

        return Response.json({ message: 'Subscription created' }, { status: 200 })
      }

      if (eventName === 'subscription_updated' && payload.meta.custom_data.order_type === 'subscription') {
        // Get the cost using the priceId from the payload
        const matchedCost = getBillingData({
          plans,
          priceId: String(payload.data.attributes.variant_id)
        })

        if (!matchedCost) {
          console.error('No matching cost found')

          return Response.json({ message: 'No matching cost found' }, { status: 404 })
        }

        const { error } = await supabase
          .from('billing')
          .update({
            plan_variant: payload.data.attributes.variant_name,
            interval: payload.meta.custom_data.interval,
            cost: matchedCost?.lineItems[0].cost
          })
          .eq('order_id', payload.data.id)

        if (error) {
          console.error('Error updating data:', error)

          return Response.json({ message: 'Error updating data' }, { status: 500 })
        }

        return Response.json({ message: 'Subscription updated' }, { status: 200 })
      }

      return Response.json({ message: 'Webhook received' })
    }

    // Stripe webhook
    if (paymentProvider?.value === 'stripe') {
      const buf = await buffer(req)
      const sig = req.headers.get('stripe-signature')

      const event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET)

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          const { error } = await supabase.from('billing').insert({
            user_id: event.data.object.metadata.user_id,
            email: event.data.object.metadata.user_email,
            billing_provider: paymentProvider.value,
            order_id:
              event.data.object.mode === 'subscription' ? event.data.object.subscription : event.data.object.customer,
            order_type: event.data.object.metadata.order_type,
            payment_email: event.data.object.customer_details.email,
            status: 'success',
            cost: event.data.object.amount_total / 100,
            plan_variant: event.data.object.metadata.plan_variant,
            interval: event.data.object.metadata.interval,
            currency: event.data.object.currency
          })

          if (error) {
            console.error('Error inserting data:', error)

            return Response.json({ message: 'Error inserting data' }, { status: 500 })
          }

          break

        case 'customer.subscription.updated':
          const { error: subscriptionUpdateError } = await supabase
            .from('billing')
            .update({
              plan_variant: event.data.object.items.data[0].plan.nickname,
              interval: event.data.object.items.data[0].plan.interval,
              cost: event.data.object.plan.amount / 100
            })
            .eq('order_id', event.data.object.id)

          if (subscriptionUpdateError) {
            console.error('Error updating data:', subscriptionUpdateError)

            return Response.json({ message: 'Error updating data' }, { status: 500 })
          }

          return new NextResponse(JSON.stringify({ received: true }), { status: 200 })

        default:
          console.log(`Unhandled event type ${event.type}`)
      }

      return new NextResponse(JSON.stringify({ received: true }), { status: 200 })
    }

    return Response.json({ message: 'Invalid payment provider' }, { status: 400 })
  } catch (err) {
    console.error(err)

    return Response.json({ message: 'Server error' }, { status: 500 })
  }
}
