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
      {
        icon: <TbPlaneDeparture className='text-2xl' />,
        title: <Trans i18nKey='data:readyForUse' />,
        description: <Trans i18nKey='data:readyForUseDesc' />
      },
      {
        icon: <TbCode className='text-2xl' />,
        title: <Trans i18nKey='data:cleanImplementation' />,
        description: <Trans i18nKey='data:cleanImplementationDesc' />
      },
      {
        icon: <TbHandClick className='text-2xl' />,
        title: <Trans i18nKey='data:oneClickIntegration' />,
        description: <Trans i18nKey='data:oneClickIntegrationDesc' />
      }
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
      {
        icon: <TbChartInfographic className='text-2xl' />,
        title: <Trans i18nKey='data:realTimeSentimentAnalysis' />,
        description: <Trans i18nKey='data:realTimeSentimentAnalysisDesc' />
      },
      {
        icon: <TbUserSearch className='text-2xl' />,
        title: <Trans i18nKey='data:behaviorTracking' />,
        description: <Trans i18nKey='data:behaviorTrackingDesc' />
      },
      {
        icon: <TbEdit className='text-2xl' />,
        title: <Trans i18nKey='data:dynamicPersonalization' />,
        description: <Trans i18nKey='data:dynamicPersonalizationDesc' />
      }
    ]
  }
]

export default data
