// Third-party Imports
import {
  TbRocket,
  TbPlaneDeparture,
  TbCode,
  TbHandClick,
  TbLock,
  TbStack2,
  TbKey,
  TbMail,
  TbLink,
  TbBrandGoogle
} from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[40px]' />,
    title: 'Production-Ready',
    description: 'JetShip provides all the essential tools and resources needed to launch your project efficiently',
    image: {
      srcLight: '/images/pages/features-section-1.png',
      srcDark: '/images/pages/features-section-1.png'
    },
    features: [
      {
        icon: <TbStack2 className='text-2xl' />,
        title: 'Solid Tech-Stack',
        description:
          'Utilizes Laravel, TailwindCSS, Livewire, AlpineJS, and FilamentPHP for a powerful, scalable & developer-friendly experience.'
      },
      {
        icon: <TbPlaneDeparture className='text-2xl' />,
        title: 'Ready for Production',
        description:
          'Login is accessing an existing account, registration is creating a new one by providing necessary information.'
      },
      {
        icon: <TbCode className='text-2xl' />,
        title: 'Clean Code',
        description:
          'Enjoy a clutter-free integration process with optimized code that ensures fast and reliable performance.'
      },
      {
        icon: <TbHandClick className='text-2xl' />,
        title: '1-Click Deployment',
        description: "Deploy your SaaS swiftly with Vercel's one-click deployment."
      }
    ]
  },
  {
    icon: <TbLock className='text-[40px]' />,
    title: 'Pre-configured Auth Process',
    description:
      'Modern Authentication Offers traditional logins and social logins through Google, GitHub, Twitter, and magic links.',
    image: {
      srcLight: '/images/pages/features-section-2.png',
      srcDark: '/images/pages/features-section-2.png'
    },
    reverse: true,
    features: [
      {
        icon: <TbBrandGoogle className='text-2xl' />,
        title: 'Social Sign-in',
        description:
          'Supports social sign-ins via Socialite with Google, GitHub, Twitter, LinkedIn, Facebook, GitLab, Bitbucket, and Slack.'
      },
      {
        icon: <TbLink className='text-2xl' />,
        title: 'Magic Links',
        description: 'Enables easy user sign-ins with email link authentication.'
      },
      {
        icon: <TbMail className='text-2xl' />,
        title: 'Email Authentication',
        description: 'Allows email and password sign-ins, ensuring email verification.'
      },
      {
        icon: <TbKey className='text-2xl' />,
        title: 'Password Reset',
        description: 'Provides a self-service password recovery feature for users.'
      }
    ]
  }
]

export default data
