// Type Imports
import type { Plan } from '@/types/billingConfigTypes'

const data: Plan[] = [
  {
    id: 'starter-plan',
    name: 'Starter',
    description: 'Basic plan for small businesses',
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
        name: 'Monthly',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'starter-monthly-49',
            name: 'Starter Monthly Subscription',
            cost: 39
          }
        ]
      },
      {
        id: 'starter-annually',
        name: 'Annually',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'starter-yearly-490',
            name: 'Starter Yearly Subscription',
            cost: 399,
            description: 'Billed annually, 2 months free'
          }
        ]
      }
    ]
  },
  {
    id: 'professional-plan',
    name: 'Professional',
    description: 'Advanced plan for growing businesses',
    currency: 'USD',
    icon: 'TbBriefcase',
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
        name: 'Monthly',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'professional-monthly-99',
            name: 'Professional Monthly Subscription',
            cost: 89
          }
        ]
      },
      {
        id: 'professional-annually',
        name: 'Annually',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'professional-yearly-990',
            name: 'Professional Yearly Subscription',
            cost: 999,
            description: 'Billed annually, 2 months free'
          }
        ]
      }
    ]
  },
  {
    id: 'enterprise-plan',
    name: 'Enterprise',
    description: 'Enterprise-level solution for large businesses',
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
        name: 'Monthly',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'enterprise-monthly-299',
            name: 'Enterprise Monthly Subscription',
            cost: 129
          }
        ]
      },
      {
        id: 'enterprise-annually',
        name: 'Annually',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'enterprise-yearly-2990',
            name: 'Enterprise Yearly Subscription',
            cost: 1299,
            description: 'Billed annually, 2 months free'
          }
        ]
      }
    ]
  }
]

export default data
