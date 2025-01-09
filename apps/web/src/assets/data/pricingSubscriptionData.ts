// Third-party Imports
import type { Plan } from '@repo/billing/src/types/billingConfigTypes'

const data: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'ChatFlow AI - Starter Plan',
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
        name: 'Starter Monthly',
        description: 'ChatFlow AI - Starter monthly Plan',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'starter-monthly-49',
            name: 'Starter Monthly',
            cost: 49,
            description: '$49.00 billed every month'
          }
        ]
      },
      {
        id: 'starter-yearly',
        name: 'Starter Yearly',
        description: 'ChatFlow AI - Starter yearly Plan',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'starter-yearly-399',
            name: 'Starter Yearly',
            cost: 399,
            description: '$399.00 billed every year'
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
        name: 'Professional Monthly',
        description: 'ChatFlow AI - Professional monthly Plan',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'professional-monthly-99',
            name: 'Professional Monthly',
            cost: 99,
            description: '$99.00 billed every month'
          }
        ]
      },
      {
        id: 'professional-yearly',
        name: 'Professional Yearly',
        description: 'ChatFlow AI - Professional yearly Plan',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'professional-yearly-499',
            name: 'Professional Yearly',
            cost: 499,
            description: '$499.00 billed every year'
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
        name: 'Enterprise Monthly',
        description: 'ChatFlow AI - Enterprise monthly Plan',
        paymentType: 'recurring',
        interval: 'monthly',
        lineItems: [
          {
            priceId: 'enterprise-monthly-299',
            name: 'Enterprise Monthly',
            cost: 299,
            description: '$299.00 billed every month'
          }
        ]
      },
      {
        id: 'enterprise-yearly',
        name: 'Enterprise Yearly',
        description: 'ChatFlow AI - Enterprise yearly Plan',
        paymentType: 'recurring',
        interval: 'yearly',
        lineItems: [
          {
            priceId: 'enterprise-yearly-999',
            name: 'Enterprise Yearly',
            cost: 999,
            description: '$999.00 billed every year'
          }
        ]
      }
    ]
  }
]

export default data
