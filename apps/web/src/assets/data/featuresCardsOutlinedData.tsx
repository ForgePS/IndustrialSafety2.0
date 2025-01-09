// Third-party Imports
import { TbRocket, TbLock, TbCreditCard } from 'react-icons/tb'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    title: 'Ready for Instant Deployment',
    description:
      'ChatFlow AI provides everything you need to integrate your chatbot swiftly, allowing you to go live in minutes and start engaging with customers instantly.',
    features: ['Ready for use', 'Clean Implementation', '1-Click Integration', 'No Code Required']
  },
  {
    icon: <TbLock className='text-[32px]' />,
    title: 'AI-Driven Customer Insights',
    description:
      'Leverage the power of AI to understand customer behavior, preferences, and needs in real-time, enabling tailored responses that improve satisfaction and loyalty.',
    features: ['Real-Time Sentiment Analysis', 'Behavior Tracking', 'Dynamic Personalization', 'Customer Segmentation']
  },
  {
    icon: <TbCreditCard className='text-[32px]' />,
    title: 'Self-Learning and Adaptability',
    description:
      'ChatFlow AI gets smarter with every interaction, continuously learning from conversations to enhance accuracy and relevance over time.',
    features: ['Machine Learning Algorithms', 'Custom Training', 'Feedback Loop', 'Continuous Improvement']
  }
]

export default data
