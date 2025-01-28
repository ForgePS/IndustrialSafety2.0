// Third-party Imports
import {
  TbElevator,
  TbLayout2,
  TbFileDiff,
  TbSearch,
  TbLayoutGridAdd,
  TbBrandGithub,
  TbChartDonut4,
  TbLanguage,
  TbListDetails,
  TbCode,
  TbBook,
  TbAlignRight
} from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

const data = [
  {
    icon: <TbElevator className='text-[32px]' />,
    title: <Trans i18nKey='data:easyNavigationTitle' />,
    description: <Trans i18nKey='data:easyNavigationDesc' />
  },
  {
    icon: <TbLayout2 className='text-[32px]' />,
    title: <Trans i18nKey='data:customizableLayoutTitle' />,
    description: <Trans i18nKey='data:customizableLayoutDesc' />
  },
  {
    icon: <TbFileDiff className='text-[32px]' />,
    title: <Trans i18nKey='data:continuousUpdatesTitle' />,
    description: <Trans i18nKey='data:continuousUpdatesDesc' />
  },
  {
    icon: <TbSearch className='text-[32px]' />,
    title: <Trans i18nKey='data:smartSearchTitle' />,
    description: <Trans i18nKey='data:smartSearchDesc' />
  },
  {
    icon: <TbLayoutGridAdd className='text-[32px]' />,
    title: <Trans i18nKey='data:easyCustomizeTitle' />,
    description: <Trans i18nKey='data:easyCustomizeDesc' />
  },
  {
    icon: <TbBrandGithub className='text-[32px]' />,
    title: <Trans i18nKey='data:directApiTitle' />,
    description: <Trans i18nKey='data:directApiDesc' />
  },
  {
    icon: <TbChartDonut4 className='text-[32px]' />,
    title: <Trans i18nKey='data:supportTitle' />,
    description: <Trans i18nKey='data:supportDesc' />
  },
  {
    icon: <TbLanguage className='text-[32px]' />,
    title: <Trans i18nKey='data:multiLanguageTitle' />,
    description: <Trans i18nKey='data:multiLanguageDesc' />
  },
  {
    icon: <TbListDetails className='text-[32px]' />,
    title: <Trans i18nKey='data:quickStartKitTitle' />,
    description: <Trans i18nKey='data:quickStartKitDesc' />
  },
  {
    icon: <TbCode className='text-[32px]' />,
    title: <Trans i18nKey='data:qualityTrainingDataTitle' />,
    description: <Trans i18nKey='data:qualityTrainingDataDesc' />
  },
  {
    icon: <TbBook className='text-[32px]' />,
    title: <Trans i18nKey='data:detailedDocumentationTitle' />,
    description: <Trans i18nKey='data:detailedDocumentationDesc' />
  },
  {
    icon: <TbAlignRight className='text-[32px]' />,
    title: <Trans i18nKey='data:rtlSupportTitle' />,
    description: <Trans i18nKey='data:rtlSupportDesc' />
  }
]

export default data
