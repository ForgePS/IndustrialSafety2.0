import crypto from 'crypto'

// Next Imports
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import { createServiceRoleClient } from '@repo/supabase/server'
import { getBillingData } from '@repo/billing/src/utils/getBillingData'

// Config Imports
import plans from '@configs/billingConfig'

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

export async function POST(req: NextRequest) {
  const supabase = createServiceRoleClient()

  const { data: paymentProvider } = await supabase
    .from('settings_configuration')
    .select('value')
    .eq('key', 'payment_provider')
    .single()

  // Get all the billing records
  const { data: billingRecords } = await supabase.from('billing').select('order_type')

  // Get the last billing record from the array
  const billingRecord = billingRecords?.[billingRecords.length - 1]

  try {
    if (paymentProvider?.value === 'lemon_squeezy') {
      // Get headers
      const headersList = await headers()
      const signature = headersList.get('x-signature')

      if (!signature) {
        return NextResponse.json({ error: 'No signature found' }, { status: 400 })
      }

      // Get raw body as text
      const rawBody = await req.clone().text()

      if (!rawBody) {
        return NextResponse.json({ error: 'No body found' }, { status: 400 })
      }

      // Compute signature
      const hmac = crypto.createHmac('sha256', process.env.LEMON_SQUEEZY_WEBHOOK_SIGNATURE!)
      const computedSignature = hmac.update(rawBody).digest('hex')

      // Verify signature
      if (signature !== computedSignature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }

      const payload = JSON.parse(rawBody)
      const eventName = payload.meta.event_name

      if (eventName === 'order_created' && billingRecord?.order_type === 'one-off') {
        // First get the max ID for this user_id
        const { data: maxIdRecord } = await supabase
          .from('billing')
          .select('id')
          .eq('user_id', payload.meta.custom_data.user_id)
          .order('id', { ascending: false })
          .limit(1)
          .single()

        if (!maxIdRecord) {
          return Response.json({ message: 'No billing record found' }, { status: 404 })
        }

        const { error } = await supabase
          .from('billing')
          .update({
            status: 'success',
            order_id: payload.data.id,
            payment_email: payload.data.attributes.user_email
          })
          .eq('id', maxIdRecord.id)

        if (error) {
          console.error('Error updating data:', error)

          return Response.json({ message: 'Error updating data' }, { status: 500 })
        }
      }

      if (eventName === 'subscription_created' && billingRecord?.order_type === 'subscription') {
        // Get the cost using the priceId from the payload
        const matchedCost = getBillingData({
          plans,
          priceId: String(payload.data.attributes.variant_id)
        })

        const { data: maxIdRecord } = await supabase
          .from('billing')
          .select('id')
          .eq('user_id', payload.meta.custom_data.user_id)
          .order('id', { ascending: false })
          .limit(1)
          .single()

        if (!maxIdRecord) {
          return Response.json({ message: 'No user record found' }, { status: 404 })
        }

        const { error } = await supabase
          .from('billing')
          .update({
            status: 'success',
            order_id: payload.data.id,
            payment_email: payload.data.attributes.user_email,
            interval: payload.meta.custom_data.interval,
            cost: matchedCost?.lineItems[0].cost
          })
          .eq('id', maxIdRecord.id)

        if (error) {
          console.error('Error updating data:', error)

          return Response.json({ message: 'Error updating data' }, { status: 500 })
        }

        return Response.json({ message: 'Subscription created' }, { status: 200 })
      }

      if (eventName === 'subscription_updated' && billingRecord?.order_type === 'subscription') {
        // Get the cost using the priceId from the payload
        const matchedCost = getBillingData({
          plans,
          priceId: String(payload.data.attributes.variant_id)
        })

        if (!matchedCost) {
          return Response.json({ message: 'No matching cost found' }, { status: 404 })
        }

        // Get the latest billing record for this subscription
        const { data: lastBilling } = await supabase
          .from('billing')
          .select('user_id, email, currency')
          .eq('order_id', payload.data.attributes.subscription_id)
          .order('id', { ascending: false })
          .limit(1)
          .single()

        const { error } = await supabase.from('billing').insert({
          user_id: lastBilling?.user_id,
          email: lastBilling?.email,
          order_id: payload.data.id,
          billing_provider: 'lemon_squeezy',
          order_type: 'subscription',
          status: 'success',
          plan_variant: payload.data.attributes.variant_name,
          interval: payload.meta.custom_data.interval,
          cost: matchedCost.lineItems[0].cost,
          currency: lastBilling?.currency
        })

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
      const rawBody = await req.text()
      const sig = req.headers.get('stripe-signature')

      let event

      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
      } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`)

        return new Response(`Webhook Error: ${err.message}`, { status: 400 })
      }

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          // First get the max ID for this user_id
          const { data: maxIdRecord } = await supabase
            .from('billing')
            .select('id')
            .eq('user_id', event.data.object.metadata.user_id)
            .order('id', { ascending: false })
            .limit(1)
            .single()

          if (!maxIdRecord) {
            return Response.json({ message: 'No billing record found' }, { status: 404 })
          }

          const { error } = await supabase
            .from('billing')
            .update({
              order_id:
                event.data.object.mode === 'subscription' ? event.data.object.subscription : event.data.object.customer,
              payment_email: event.data.object.customer_details.email,
              status: 'success',
              cost: event.data.object.amount_total / 100,
              plan_variant: event.data.object.metadata.plan_variant,
              interval: event.data.object.metadata.interval
            })
            .eq('id', maxIdRecord.id)

          if (error) {
            console.error('Error updating data:', error)

            return Response.json({ message: 'Error updating data' }, { status: 500 })
          }

          break

        case 'customer.subscription.updated':
          const subscription = event.data.object

          // Check if the subscription's ITEMS (plan) changed
          const isPlanChange = !!event.data.previous_attributes?.items

          // If no plan change, skip inserting a new row
          if (!isPlanChange) break

          // Get the latest billing record for this subscription
          const { data: lastBilling } = await supabase
            .from('billing')
            .select('user_id, email, currency, payment_email')
            .eq('order_id', subscription.id)
            .order('id', { ascending: false })
            .limit(1)
            .single()

          const { error: subscriptionUpdateError } = await supabase.from('billing').insert({
            user_id: lastBilling?.user_id,
            email: lastBilling?.email,
            order_id: subscription.id,
            billing_provider: 'stripe',
            order_type: 'subscription',
            status: 'success',
            payment_email: lastBilling?.payment_email,
            plan_variant: subscription.items.data[0].plan.nickname,
            interval: subscription.items.data[0].plan.interval,
            cost: subscription.plan.amount / 100,
            currency: subscription.currency
          })

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
