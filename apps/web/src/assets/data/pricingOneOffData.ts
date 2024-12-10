// Type Imports
import type { Plan } from '@/types/billingConfigTypes'

const data: Plan[] = [
  {
    id: 'starter-plan',
    name: 'Starter',
    description: 'Starter plan with basic features.',
    currency: 'USD',
    icon: 'TbRocket',
    variants: [
      {
        id: 'starter-one-off',
        name: 'Starter One-off',
        description: 'One-off payment for the Starter plan',
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
            priceId: 'starter-one-off-price-id',
            name: 'Starter Plan',
            cost: 39,
            description: 'One-off payment for the Starter plan'
          }
        ]
      }
    ]
  },
  {
    id: 'professional-plan',
    name: 'Professional',
    description: 'Professional plan with advanced features.',
    currency: 'USD',
    icon: 'TbBriefcase',
    badge: 'Most Popular',
    highlighted: true,
    variants: [
      {
        id: 'professional-one-off',
        name: 'Professional One-off',
        description: 'One-off payment for the Professional plan',
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
            priceId: 'professional-one-off-price-id',
            name: 'Professional Plan',
            cost: 89,
            description: 'One-off payment for the Professional plan'
          }
        ]
      }
    ]
  },
  {
    id: 'enterprise-plan',
    name: 'Enterprise',
    description: 'Enterprise plan with premium features.',
    currency: 'USD',
    icon: 'TbCrown',
    variants: [
      {
        id: 'enterprise-one-off',
        name: 'Enterprise One-off',
        description: 'One-off payment for the Enterprise plan',
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
            priceId: 'enterprise-one-off-price-id',
            name: 'Enterprise Plan',
            cost: 129,
            description: 'One-off payment for the Enterprise plan'
          }
        ]
      }
    ]
  }
]

export default data
