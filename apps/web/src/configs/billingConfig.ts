// Third-party Imports
import type { Plan } from '@repo/billing/src/types/billingConfigTypes'

const plans: Plan[] = [
  {
    id: 'prod_QzCPwsSmdroRXQ',
    name: 'Starter',
    description: 'It is a starter plan for ChatFlow AI',
    currency: 'USD',
    icon: 'TbRocket',
    features: [
      '10 GB Storage',
      '1 Custom Domain',
      'AI-Powered Chatbot (Basic Features)',
      'Standard Analytics Dashboard',
      'Email Support',
      'Automated Responses'
    ],
    variants: [
      {
        id: 'starter-monthly',
        name: 'Starter',
        paymentType: 'recurring',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'price_1Q7E0wRqWZ1UaArunROQm7QY',
            name: 'Starter Monthly',
            cost: 49,
            description: '$49.00 billed every month'
          }
        ]
      },
      {
        id: 'starter-yearly',
        name: 'Starter',
        paymentType: 'recurring',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'price_1Q7E1URqWZ1UaArurLqC5OZi',
            name: 'Starter Yearly',
            cost: 399,
            description: '$399.00 billed every year'
          }
        ]
      }
    ]
  },
  {
    id: 'prod_QzAC1i5XKPSDxs',
    name: 'Professional',
    description: 'It is a professional plan for ChatFlow AI',
    currency: 'USD',
    icon: 'TbUsers',
    badge: 'Most Popular',
    highlighted: true,
    features: [
      '100 GB Storage',
      '5 Custom Domains',
      'AI-Powered Chatbot (Advanced Features)',
      'Advanced Analytics Dashboard',
      'Multilingual Support',
      'Priority Email & Chat Support'
    ],
    variants: [
      {
        id: 'professional-monthly',
        name: 'Professional',
        paymentType: 'recurring',
        interval: 'monthly',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        lineItems: [
          {
            priceId: 'price_1Q7BskRqWZ1UaAruDHs0qF5H',
            name: 'Professional Monthly',
            cost: 99,
            description: '$99.00 billed every month'
          }
        ]
      },
      {
        id: 'professional-yearly',
        name: 'Professional',
        paymentType: 'recurring',
        interval: 'yearly',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        lineItems: [
          {
            priceId: 'price_1Q7DzURqWZ1UaArup89VzvIN',
            name: 'Professional Yearly',
            cost: 499,
            description: '$499.00 billed every year'
          }
        ]
      }
    ]
  },
  {
    id: 'prod_QzCRzx3wgs6TED',
    name: 'Enterprise',
    description: 'It is a enterprise plan for ChatFlow AI',
    currency: 'USD',
    icon: 'TbCrown',
    features: [
      'Unlimited Storage',
      '20 Custom Domains',
      'AI-Powered Chatbot (All Features)',
      'Customizable AI Responses',
      'Dedicated Account Manager',
      '24/7 Premium Support'
    ],
    variants: [
      {
        id: 'enterprise-monthly',
        name: 'Enterprise',
        paymentType: 'recurring',
        interval: 'monthly',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        lineItems: [
          {
            priceId: 'price_1Q7E2fRqWZ1UaAruvsYq46Au',
            name: 'Enterprise Monthly',
            cost: 299,
            description: '$299.00 billed every month'
          }
        ]
      },
      {
        id: 'enterprise-yearly',
        name: 'Enterprise',
        paymentType: 'recurring',
        interval: 'yearly',
        description:
          'ChatFlow AI is your all-in-one solution for automating conversations, resolving queries faster, and enhancing customer satisfaction with a powerful AI chatbot. We handle the complex backend operations, allowing you to focus on delivering exceptional customer experiences and growing your business.',
        lineItems: [
          {
            priceId: 'price_1Q7E39RqWZ1UaAruTMJsMGM1',
            name: 'Enterprise Yearly',
            cost: 999,
            description: '$999.00 billed every year'
          }
        ]
      }
    ]
  }
]

export default plans
