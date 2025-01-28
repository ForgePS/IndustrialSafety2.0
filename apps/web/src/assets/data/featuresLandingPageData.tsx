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
    reverse: true,
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
  },
  {
    icon: <TbRocket className='text-[32px]' />,
    content: <Trans i18nKey='data:boostEfficiencyWithAutomation' />,
    title: <Trans i18nKey='data:smartWorkflowAutomation' />,
    description: <Trans i18nKey='data:smartWorkflowAutomationDesc' />,
    image: {
      srcLight: '/images/pages/features-section-3.png',
      srcDark: '/images/pages/features-section-3.png'
    },
    reverse: true,
    features: [
      {
        icon: <TbBulb className='text-2xl' />,
        title: <Trans i18nKey='data:instantQueryResolution' />,
        description: <Trans i18nKey='data:instantQueryResolutionDesc' />
      },
      {
        icon: <TbLanguage className='text-2xl' />,
        title: <Trans i18nKey='data:multilingualSupport' />,
        description: <Trans i18nKey='data:multilingualSupportDesc' />
      },
      {
        icon: <TbHandOff className='text-2xl' />,
        title: <Trans i18nKey='data:seamlessHandoff' />,
        description: <Trans i18nKey='data:seamlessHandoffDesc' />
      }
    ]
  },
  {
    icon: <TbLock className='text-[32px]' />,
    content: <Trans i18nKey='data:continuouslyImproveWithAILearning' />,
    title: <Trans i18nKey='data:selfLearningAndAdaptability' />,
    description: <Trans i18nKey='data:selfLearningAndAdaptabilityDesc' />,
    image: {
      srcLight: '/images/pages/features-section-4.png',
      srcDark: '/images/pages/features-section-4.png'
    },
    features: [
      {
        icon: <TbCpu className='text-2xl' />,
        title: <Trans i18nKey='data:machineLearningAlgorithms' />,
        description: <Trans i18nKey='data:machineLearningAlgorithmsDesc' />
      },
      {
        icon: <TbUsers className='text-2xl' />,
        title: <Trans i18nKey='data:customTraining' />,
        description: <Trans i18nKey='data:customTrainingDesc' />
      },
      {
        icon: <TbMessages className='text-2xl' />,
        title: <Trans i18nKey='data:feedbackLoop' />,
        description: <Trans i18nKey='data:feedbackLoopDesc' />
      }
    ]
  }
]

export default data
