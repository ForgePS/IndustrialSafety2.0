// Third-party Imports
import { TbRocket, TbLock, TbCreditCard } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

const data = [
  {
    icon: <TbRocket className='text-[32px]' />,
    title: <Trans i18nKey='data:readyForInstantDeployment' />,
    description: <Trans i18nKey='data:readyForInstantDeploymentDesc' />,
    features: [
      <Trans key='1' i18nKey='data:readyForUse' />,
      <Trans key='2' i18nKey='data:cleanImplementation' />,
      <Trans key='3' i18nKey='data:oneClickIntegration' />,
      <Trans key='4' i18nKey='data:noCodeRequired' />
    ]
  },
  {
    icon: <TbLock className='text-[32px]' />,
    title: <Trans i18nKey='data:aiDrivenCustomerInsights' />,
    description: <Trans i18nKey='data:aiDrivenCustomerInsightsDesc' />,
    features: [
      <Trans key='1' i18nKey='data:realTimeSentimentAnalysis' />,
      <Trans key='2' i18nKey='data:behaviorTracking' />,
      <Trans key='3' i18nKey='data:dynamicPersonalization' />,
      <Trans key='4' i18nKey='data:customerSegmentation' />
    ]
  },
  {
    icon: <TbCreditCard className='text-[32px]' />,
    title: <Trans i18nKey='data:selfLearningAndAdaptability' />,
    description: <Trans i18nKey='data:selfLearningAndAdaptabilityDesc' />,
    features: [
      <Trans key='1' i18nKey='data:machineLearningAlgorithms' />,
      <Trans key='2' i18nKey='data:customTraining' />,
      <Trans key='3' i18nKey='data:feedbackLoop' />,
      <Trans key='4' i18nKey='data:continuousImprovement' />
    ]
  }
]

export default data
