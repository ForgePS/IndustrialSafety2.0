// Third-party Imports
import type { Plan } from '@repo/billing/src/types/billingConfigTypes'

const data: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'ChatFlow AI - Starter Plan',
    currency: 'USD',
    icon: 'TbRocket',
    variants: [
      {
        id: 'starter-plan',
        name: 'Starter Plan',
        description: 'ChatFlow AI - Starter Plan',
        paymentType: 'one-off',
        features: [
          '10 GB Storage',
          '1 Custom Domain',
          'AI-Powered Chatbot (Basic Features)',
          'Standard Analytics Dashboard',
          'Email Support',
          'Automated Responses'
        ],
        lineItems: [
          {
            priceId: 'starter-plan-49',
            name: 'Starter Plan',
            cost: 49,
            description: '$49.00 billed one-time'
          }
        ]
      }
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'ChatFlow AI - Professional Plan',
    currency: 'USD',
    icon: 'TbUsers',
    badge: 'Most Popular',
    highlighted: true,
    variants: [
      {
        id: 'professional-plan',
        name: 'Professional Plan',
        description: 'ChatFlow AI - Professional Plan',
        paymentType: 'one-off',
        features: [
          '100 GB Storage',
          '5 Custom Domains',
          'AI-Powered Chatbot (Advanced Features)',
          'Advanced Analytics Dashboard',
          'Multilingual Support',
          'Priority Email & Chat Support'
        ],
        lineItems: [
          {
            priceId: 'professional-plan-99',
            name: 'Professional Plan',
            cost: 99,
            description: '$99.00 billed one-time'
          }
        ]
      }
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'ChatFlow AI - Enterprise Plan',
    currency: 'USD',
    icon: 'TbCrown',
    variants: [
      {
        id: 'enterprise-plan',
        name: 'Enterprise Plan',
        description: 'ChatFlow AI - Enterprise Plan',
        paymentType: 'one-off',
        features: [
          'Unlimited Storage',
          '20 Custom Domains',
          'AI-Powered Chatbot (All Features)',
          'Customizable AI Responses',
          'Dedicated Account Manager',
          '24/7 Premium Support'
        ],
        lineItems: [
          {
            priceId: 'enterprise-plan-299',
            name: 'Enterprise Plan',
            cost: 299,
            description: '$299.00 billed one-time'
          }
        ]
      }
    ]
  }
]

export default data
