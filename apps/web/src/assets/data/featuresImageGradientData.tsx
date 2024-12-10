// Third-party Imports
import { TbRocket, TbLock } from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    content: 'Launch your app quickly',
    title: 'Production-Ready',
    description: 'JetShip provides all the essential tools and resources needed to launch your project efficiently',
    image: {
      srcLight: '/images/pages/features-section-1.png',
      srcDark: '/images/pages/features-section-1.png'
    },
    reverse: true,
    features: ['Solid Tech-Stack', 'Ready for Production', 'Clean Code', '1-Click Deployment']
  },
  {
    icon: <TbLock className='text-[32px]' />,
    content: 'Pre-configured Auth Process',
    title: 'Modern Authentication',
    description:
      'Modern Authentication Offers traditional logins and social logins through Google, GitHub, Twitter, and magic links.',
    image: {
      srcLight: '/images/pages/features-section-2.png',
      srcDark: '/images/pages/features-section-2.png'
    },
    features: ['Social Sign-in', 'Magic Links', 'Email Authentication', 'Password Reset']
  }
]

export default data
