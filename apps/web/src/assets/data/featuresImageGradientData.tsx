// Third-party Imports
import { TbRocket, TbLock } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    content: <Trans i18nKey='data:launchYourChatbotQuickly' />,
    title: <Trans i18nKey='data:readyForInstantDeployment' />,
    description: <Trans i18nKey='data:readyForInstantDeploymentDesc' />,
    image: {
      srcLight: '/images/pages/features-section-1.png',
      srcDark: '/images/pages/features-section-1.png'
    },
    features: [
      <Trans key='1' i18nKey='data:solidTechStack' />,
      <Trans key='2' i18nKey='data:readyForProduction' />,
      <Trans key='3' i18nKey='data:cleanCode' />,
      <Trans key='4' i18nKey='data:oneClickDeployment' />
    ]
  },
  {
    icon: <TbLock className='text-[32px]' />,
    content: <Trans i18nKey='data:personalizeEveryInteraction' />,
    title: <Trans i18nKey='data:aiDrivenCustomerInsights' />,
    description: <Trans i18nKey='data:aiDrivenCustomerInsightsDesc' />,
    image: {
      srcLight: '/images/pages/features-section-2.png',
      srcDark: '/images/pages/features-section-2.png'
    },
    reverse: true,
    features: [
      <Trans key='1' i18nKey='data:realTimeSentimentAnalysis' />,
      <Trans key='2' i18nKey='data:behaviorTracking' />,
      <Trans key='3' i18nKey='data:dynamicPersonalization' />,
      <Trans key='4' i18nKey='data:customerSegmentation' />
    ]
  }
]

export default data
