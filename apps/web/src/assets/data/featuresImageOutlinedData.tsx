// Third-party Imports
import {
  TbRocket,
  TbPlaneDeparture,
  TbCode,
  TbHandClick,
  TbLock,
  TbChartInfographic,
  TbUserSearch,
  TbEdit
} from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[40px]' />,
    title: 'Ready for Instant Deployment',
    description:
      'ChatFlow AI provides everything you need to integrate your chatbot swiftly, allowing you to go live in minutes and start engaging with customers instantly.',
    image: {
      srcLight: '/images/pages/features-section-1.png',
      srcDark: '/images/pages/features-section-1.png'
    },
    features: [
      {
        icon: <TbPlaneDeparture className='text-2xl' />,
        title: 'Ready for use',
        description:
          'Seamlessly integrate with existing systems and provide immediate support to your users without any downtime.'
      },
      {
        icon: <TbCode className='text-2xl' />,
        title: 'Clean Implementation',
        description:
          'Enjoy a clutter-free integration process with optimized code that ensures fast and reliable performance.'
      },
      {
        icon: <TbHandClick className='text-2xl' />,
        title: '1-Click Integration',
        description: 'Deploy your AI-powered chatbot with a single click - no complex setup or configurations required.'
      }
    ]
  },
  {
    icon: <TbLock className='text-[40px]' />,
    title: 'AI-Driven Customer Insights',
    description:
      'Leverage the power of AI to understand customer behavior, preferences, and needs in real-time, enabling tailored responses that improve satisfaction and loyalty.',
    image: {
      srcLight: '/images/pages/features-section-2.png',
      srcDark: '/images/pages/features-section-2.png'
    },
    reverse: true,
    features: [
      {
        icon: <TbChartInfographic className='text-2xl' />,
        title: 'Real-Time Sentiment Analysis',
        description: 'Analyze customer emotions and moods instantly to provide empathetic and relevant responses.'
      },
      {
        icon: <TbUserSearch className='text-2xl' />,
        title: 'Behavior Tracking',
        description: 'Monitor user behavior patterns to anticipate needs and proactively offer solutions.'
      },
      {
        icon: <TbEdit className='text-2xl' />,
        title: 'Dynamic Personalization',
        description:
          'Customize conversations based on customer history and preferences for a unique, engaging experience.'
      }
    ]
  }
]

export default data
