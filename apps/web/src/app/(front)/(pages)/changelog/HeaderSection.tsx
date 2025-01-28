// Third-party Imports
import Trans from '@repo/i18n/Trans'
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const HeaderSection = () => {
  return (
    <section
      id='home'
      className='pbs-16 -mbs-16 relative z-[1] bg-cover bg-center bg-no-repeat [background-image:url(/images/pages/hero-bg.png)]'
    >
      <div
        className={cn(
          'bs-64 sm:bs-[342px] flex flex-col items-center justify-center gap-3',
          frontCommonStyles.layoutSpacing
        )}
      >
        <h1 className='max-is-[657px] relative text-center text-3xl font-bold'>
          <Trans i18nKey='front-pages:changelogTitle' />
          <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
        </h1>
        <p className='max-is-[657px] text-textSecondary text-center text-lg sm:text-xl'>
          <Trans i18nKey='front-pages:changelogDescription' />
        </p>
      </div>
    </section>
  )
}

export default HeaderSection
