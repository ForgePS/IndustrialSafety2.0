// Third-party Imports
import { TbRocket, TbLock } from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    content: 'Launch Your Chatbot Quickly',
    title: 'Ready for Instant Deployment',
    description:
      'ChatFlow AI provides everything you need to integrate your chatbot swiftly, allowing you to go live in minutes and start engaging with customers instantly.',
    image: {
      srcLight: '/images/pages/features-section-1.png',
      srcDark: '/images/pages/features-section-1.png'
    },
    features: ['Solid Tech-Stack', 'Ready for Production', 'Clean Code', '1-Click Deployment']
  },
  {
    icon: <TbLock className='text-[32px]' />,
    content: 'Personalize Every Interaction',
    title: 'AI-Driven Customer Insights',
    description:
      'Leverage the power of AI to understand customer behavior, preferences, and needs in real-time, enabling tailored responses that improve satisfaction and loyalty.',
    image: {
      srcLight: '/images/pages/features-section-2.png',
      srcDark: '/images/pages/features-section-2.png'
    },
    reverse: true,
    features: ['Real-Time Sentiment Analysis', 'Behavior Tracking', 'Dynamic Personalization', 'Customer Segmentation']
  }
]

export default data
