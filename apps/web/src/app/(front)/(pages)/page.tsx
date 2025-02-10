// React Imports
import { Fragment } from 'react'

// Next Imports
import Link from 'next/link'
import type { Metadata } from 'next'

// Third-party Imports
import FAQ from '@repo/ui/blocks/faq/FAQ'
import { Badge } from '@repo/ui/components/ui/badge'
import { createClient } from '@repo/supabase/server'
import Reviews from '@repo/ui/blocks/reviews/Reviews'
import CTABuyNow from '@repo/ui/blocks/cta/CTABuyNow'
import CTADiscord from '@repo/ui/blocks/cta/CTADiscord'
import Separator from '@repo/ui/blocks/others/Separator'
import SectionHeader from '@repo/ui/blocks/others/SectionHeader'
import SectionWrapper from '@repo/ui/blocks/others/SectionWrapper'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import HeroHorizontalImage from '@repo/ui/blocks/hero/HeroHorizontalImage'
import FeaturesImageAccordion from '@repo/ui/blocks/features/FeaturesImageAccordion'
import AdditionalFeaturesVertical from '@repo/ui/blocks/additional-features/AdditionalFeaturesVertical'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Pricing from './Pricing'

// Config Imports
import pricingData from '@configs/billingConfig'

// Data Imports
import additionalFeaturesData from '@/assets/data/additionalFeaturesVerticalData'
import featuresData from '@/assets/data/featuresLandingPageData'
import ctaDiscordData from '@/assets/data/ctaDiscordLandingPageData'
import ctaBuyNowData from '@/assets/data/ctaBuyNowLandingPageData'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
  }
}

const LandingPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data: faqsData, error: faqsError } = await supabase
    .from('faqs')
    .select('*')
    .eq('is_featured', true)
    .order('id', { ascending: true })

  if (faqsError) {
    console.error('Error fetching faqs: ', faqsError.message)

    return
  }

  const { data: reviewsData, error: reviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('is_featured', true)
    .order('id', { ascending: true })

  if (reviewsError) {
    console.error('Error fetching reviews: ', reviewsError.message)

    return
  }

  const { data: platformData, error: platformError } = await supabase
    .from('review_platforms')
    .select('id, logo, platform_name')
    .order('id', { ascending: true })

  if (platformError) {
    console.error('Error fetching review platforms: ', platformError.message)

    return
  }

  return (
    <div id='landing-page'>
      {/* Hero Section */}
      <HeroHorizontalImage />

      {/* Features Section */}
      <SectionWrapper id='features-section' className='plb-16 sm:plb-20 md:plb-[150px] flex flex-col gap-24'>
        {featuresData.map((item, index) => (
          <Fragment key={index}>
            <FeaturesImageAccordion
              icon={item.icon}
              content={item.content}
              title={item.title}
              description={item.description}
              image={item.image}
              imageDirection={item.reverse ? 'right' : 'left'}
              features={item.features}
            />
            {featuresData.length - 1 !== index && <Separator />}
          </Fragment>
        ))}
      </SectionWrapper>

      <hr />

      {/* Additional Features */}
      <SectionWrapper id='additional-features-section' className='plb-16 sm:plb-20 md:plb-[150px]'>
        <AdditionalFeaturesVertical data={additionalFeaturesData} />
      </SectionWrapper>

      <hr />

      {/* Reviews Section */}
      <SectionWrapper id='reviews-section' className='plb-16 sm:plb-20 md:plb-[150px] flex flex-col gap-10 md:gap-20'>
        <MotionFadeElement
          component='div'
          variants={{
            hidden: { y: 30 },
            show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
          }}
        >
          <SectionHeader
            title={
              <>
                <Trans i18nKey='front-pages:landingReviewsTitle1' />{' '}
                <span className='relative'>
                  <Trans i18nKey='front-pages:landingReviewsTitle2' />
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
                </span>
              </>
            }
            subtitle={<Trans i18nKey='front-pages:landingReviewsSubtitle' />}
          />
        </MotionFadeElement>
        <Reviews data={reviewsData} platformData={platformData} transitionDelay={0.5} />
      </SectionWrapper>

      <hr />

      {/* Pricing Section */}
      <SectionWrapper id='pricing-section' className='plb-16 sm:plb-20 md:plb-[150px] flex flex-col gap-24'>
        <Pricing
          title={<Trans i18nKey='front-pages:landingPricingTitle' />}
          description={
            <>
              <div className='flex flex-wrap items-center justify-center gap-2'>
                <Badge className='text-destructive bg-destructive/20'>
                  <Trans i18nKey='front-pages:landingPricingBadge' />
                </Badge>
                <p className='text-textPrimary text-lg font-semibold sm:text-xl'>
                  <Trans i18nKey='front-pages:landingPricingOffer' />
                </p>
              </div>
              <p className='text-textSecondary text-center text-base'>
                <Trans i18nKey='front-pages:landingPricingDesc' />
              </p>
            </>
          }
          data={pricingData}
        />
      </SectionWrapper>

      {/* CTA Discord Section */}
      <SectionWrapper id='discord-section' sectionClassName='overflow-visible'>
        <CTADiscord
          image={ctaDiscordData.image}
          title={ctaDiscordData.title}
          description={ctaDiscordData.description}
          button={ctaDiscordData.button}
        />
      </SectionWrapper>

      {/* FAQ Section */}
      <SectionWrapper id='faq-section' className='plb-16 sm:plb-20 md:plb-[150px] flex flex-col gap-10 md:gap-20'>
        <MotionFadeElement
          component='div'
          variants={{
            hidden: { y: 30 },
            show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
          }}
        >
          <SectionHeader
            title={
              <>
                <Trans i18nKey='front-pages:landingFaqTitle1' />{' '}
                <span className='relative'>
                  <Trans i18nKey='front-pages:landingFaqTitle2' />
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
                </span>
              </>
            }
            subtitle={
              <>
                <Link href='/faqs' className='underline'>
                  <Trans i18nKey='front-pages:landingFaqLink' />
                </Link>{' '}
                <Trans i18nKey='front-pages:landingFaqSubtitle' />
              </>
            }
          />
        </MotionFadeElement>
        <MotionFadeElement
          component='div'
          variants={{
            hidden: { y: 30 },
            show: { transition: { delay: 0.5, duration: 0.4 }, y: 0 }
          }}
        >
          <FAQ accordionVariant='split' data={faqsData} />
        </MotionFadeElement>
      </SectionWrapper>

      {/* CTA Buy Now Section */}
      <SectionWrapper id='buy-now-section' className='pbe-16 sm:pbe-20 md:pbe-[150px]'>
        <CTABuyNow
          logo={ctaBuyNowData.logo}
          content={ctaBuyNowData.content}
          button={ctaBuyNowData.button}
          image={ctaBuyNowData.image}
        />
      </SectionWrapper>
    </div>
  )
}

export default LandingPage
