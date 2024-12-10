// Third-party Imports
import {
  TbRocket,
  TbPlaneDeparture,
  TbCode,
  TbHandClick,
  TbLock,
  TbChartInfographic,
  TbUserSearch,
  TbEdit,
  TbBulb,
  TbLanguage,
  TbHandOff,
  TbCpu,
  TbUsers,
  TbMessages
} from 'react-icons/tb'

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
    reverse: true,
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
        description: 'Deploy your AI-powered chatbot with a single click—no complex setup or configurations required.'
      }
    ]
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
  },
  {
    icon: <TbRocket className='text-[32px]' />,
    content: 'Boost Efficiency with Automation',
    title: 'Smart Workflow Automation',
    description:
      'Reduce response times and free up your human agents by automating repetitive tasks and resolving common queries instantly.',
    image: {
      srcLight: '/images/pages/features-section-3.png',
      srcDark: '/images/pages/features-section-3.png'
    },
    reverse: true,
    features: [
      {
        icon: <TbBulb className='text-2xl' />,
        title: 'Instant Query Resolution',
        description:
          'Automatically handle up to 80% of customer inquiries, freeing your team to focus on complex issues.'
      },
      {
        icon: <TbLanguage className='text-2xl' />,
        title: 'Multilingual Support',
        description: 'Support global audiences with real-time translation and multilingual capabilities.'
      },
      {
        icon: <TbHandOff className='text-2xl' />,
        title: 'Seamless Handoff',
        description:
          'Automatically route complex cases to human agents while providing full context for faster resolution.'
      }
    ]
  },
  {
    icon: <TbLock className='text-[32px]' />,
    content: 'Continuously Improve with AI Learning',
    title: 'Self-Learning and Adaptability',
    description:
      'ChatFlow AI gets smarter with every interaction, continuously learning from conversations to enhance accuracy and relevance over time.',
    image: {
      srcLight: '/images/pages/features-section-4.png',
      srcDark: '/images/pages/features-section-4.png'
    },
    features: [
      {
        icon: <TbCpu className='text-2xl' />,
        title: 'Machine Learning Algorithms',
        description:
          'Utilize advanced ML algorithms that evolve with every customer interaction, ensuring better responses.'
      },
      {
        icon: <TbUsers className='text-2xl' />,
        title: 'Custom Training',
        description:
          'Train the chatbot on your unique business data to improve its understanding of your specific customer needs.'
      },
      {
        icon: <TbMessages className='text-2xl' />,
        title: 'Feedback Loop',
        description: "Incorporate customer feedback directly into the AI's learning process for continuous improvement."
      }
    ]
  }
]

export default data
