// React Imports
import { Fragment } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { Badge } from '@repo/ui/components/ui/badge'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import HeroHorizontalImage from '@repo/ui/blocks/hero/HeroHorizontalImage'
import SectionWrapper from '@repo/ui/blocks/others/SectionWrapper'
import FeaturesImageAccordion from '@repo/ui/blocks/features/FeaturesImageAccordion'
import Separator from '@repo/ui/blocks/others/Separator'
import AdditionalFeaturesVertical from '@repo/ui/blocks/additional-features/AdditionalFeaturesVertical'
import SectionHeader from '@repo/ui/blocks/others/SectionHeader'
import Reviews from '@repo/ui/blocks/reviews/Reviews'
import PricingSubscription from '@repo/ui/blocks/pricing/PricingSubscription'
import CTADiscord from '@repo/ui/blocks/cta/CTADiscord'
import FAQ from '@repo/ui/blocks/faq/FAQ'
import CTABuyNow from '@repo/ui/blocks/cta/CTABuyNow'
import { createClient } from '@repo/supabase/server'

// Data Imports
import additionalFeaturesData from '@/assets/data/additionalFeaturesVerticalData'
import featuresData from '@/assets/data/featuresLandingPageData'
import pricingData from '@/assets/data/pricingSubscriptionData'
import ctaDiscordData from '@/assets/data/ctaDiscordData'
import ctaBuyNowData from '@/assets/data/ctaBuyNowData'

const LandingPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data: faqsData, error: faqsError } = await supabase
    .from('faqs')
    .select('*')
    .eq('isFeatured', true)
    .order('id', { ascending: true })

  if (faqsError) {
    console.error('Error fetching faqs: ', faqsError.message)

    return
  }

  const { data: reviewsData, error: reviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('isFeatured', true)
    .order('id', { ascending: true })

  if (reviewsError) {
    console.error('Error fetching reviews: ', reviewsError.message)

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

      <SectionWrapper>
        <Separator />
      </SectionWrapper>

      {/* Additional Features */}
      <SectionWrapper id='additional-features-section' className='plb-16 sm:plb-20 md:plb-[150px]'>
        <AdditionalFeaturesVertical data={additionalFeaturesData} />
      </SectionWrapper>

      <SectionWrapper>
        <Separator />
      </SectionWrapper>

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
                Real{' '}
                <span className='relative'>
                  Customers Reviews
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
                </span>
              </>
            }
            subtitle='See what our customers have to say about their experience with our products.'
          />
        </MotionFadeElement>
        <Reviews data={reviewsData} transitionDelay={0.5} />
      </SectionWrapper>

      <SectionWrapper>
        <Separator />
      </SectionWrapper>

      {/* Pricing Section */}
      <SectionWrapper id='pricing-section' className='plb-16 sm:plb-20 md:plb-[150px] flex flex-col gap-24'>
        <PricingSubscription
          title='Pricing Details'
          description={
            <>
              <div className='flex flex-wrap items-center justify-center gap-2'>
                <Badge className='text-destructive bg-destructive/20'>UP TO $40% OFF</Badge>
                <p className='text-textPrimary text-lg font-semibold sm:text-xl'>for First 100 Customers.</p>
              </div>
              <p className='text-textSecondary text-center text-base'>All-inclusive pricing. Shop now and save big!</p>
            </>
          }
          data={pricingData}
        />
      </SectionWrapper>

      {/* CTA Discord Section */}
      <SectionWrapper id='discord-section'>
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
                Frequently asked{' '}
                <span className='relative'>
                  questions
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
                </span>
              </>
            }
            subtitle={
              <>
                <Link href='/faqs' className='underline'>
                  Check out the full FAQ
                </Link>{' '}
                for more information about ChatFlow AI.
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
          <FAQ accordionVariant='split' data={faqsData.slice(0, 6)} />
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
