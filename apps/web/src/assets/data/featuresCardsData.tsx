// Third-party Imports
import { TbRocket, TbLock, TbCreditCard } from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    title: 'Production-Ready',
    description: 'JetShip provides all the essential tools and resources needed to launch your project efficiently',
    features: ['Ready for Production', 'Clean Code', '1-Click Deployment', 'Solid Tech-Stack']
  },
  {
    icon: <TbLock className='text-[32px]' />,
    title: 'Modern Authentication',
    description:
      'Modern Authentication Offers traditional logins and social logins through Google, GitHub, Twitter, and magic links.',
    features: ['Social Sign-in', 'Magic Links', 'Email Authentication', 'Password Reset']
  },
  {
    icon: <TbCreditCard className='text-[32px]' />,
    title: 'Easy Payments',
    description: 'Accept payments seamlessly through popular gateways like Stripe or LemonSqueezy.',
    features: ['Stripe Checkout', 'Lemon Squeezy Support', 'Customer Portal', 'Beautiful Checkout']
  }
]

export default data
