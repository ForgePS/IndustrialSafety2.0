'use client'

// Next Imports
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { TbDotsCircleHorizontal } from 'react-icons/tb'
import * as Icons from 'react-icons/tb'
import { cn } from '@repo/ui/lib/utils'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@repo/ui/components/ui/accordion'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import Trans from '@repo/i18n/Trans'

// Type Imports
import type { FaqWithCategory } from '@/app/(back)/admin/faqs/faq/Faq'
import type { CategoryTypes } from '@/app/(back)/admin/faqs/category/Categories'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

// To render dynamic icons
type DynamicIconProps = {
  icon: keyof typeof Icons
  className?: string
}

const DynamicIcon = ({ icon, className }: DynamicIconProps) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className={className} />
}

const Details = ({ categoryData, faqData }: { categoryData: CategoryTypes[]; faqData: FaqWithCategory[] }) => {
  // Hooks
  const searchParams = useSearchParams()

  // Vars
  const search = searchParams.get('search') || ''

  const filteredFaqData = faqData.filter(faq => faq.title.toLowerCase().includes(search.toLowerCase()))

  // Filter FAQs that don't have a category (for "Others" section)
  const othersFaqData = filteredFaqData.filter(faq => !faq.category_id)

  // Transform a string to a URL-friendly format
  const transformToUrlFriendly = (str: string) => {
    return str.toLowerCase().replace(/\s+/g, '-')
  }

  return (
    <>
      {filteredFaqData.length ? (
        <div
          className={cn(
            'mlb-10 lg:mlb-20 grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-4',
            frontCommonStyles.layoutSpacing
          )}
        >
          <aside className='bs-max block-start-20 lg:sticky'>
            <div className='flex flex-col gap-y-6'>
              <h2 className='text-textPrimary text-xl font-semibold'>
                <Trans i18nKey='front-pages:enterDetailsText' />
              </h2>
              <ul className='bg-card flex flex-col gap-y-4 rounded-md border p-6'>
                {categoryData
                  .filter(category => filteredFaqData.some(faq => faq.category_id === category.id))
                  .map((data: CategoryTypes) => (
                    <li key={data.id} className='text-textSecondary flex items-center gap-2'>
                      <DynamicIcon icon={data.icon} className='text-[1.375rem]' />
                      <Link href={`#${transformToUrlFriendly(data.title)}`} className='truncate font-semibold'>
                        {data.title}
                      </Link>
                    </li>
                  ))}

                {othersFaqData.length > 0 && (
                  <li className='text-textSecondary flex items-center gap-2'>
                    <TbDotsCircleHorizontal className='bs-6 is-6' />
                    <Link href='#others' className='truncate font-medium'>
                      <Trans i18nKey='front-pages:faqsOthersTitle' />
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </aside>
          <div className='lg:col-span-3'>
            <div className='flex flex-col gap-y-8'>
              {categoryData
                .filter(category => filteredFaqData.some(faq => faq.category_id === category.id)) // Only render categories with matching FAQs
                .map((data: CategoryTypes) => (
                  <div
                    key={data.id}
                    className='flex scroll-mt-20 flex-col items-start gap-3'
                    id={transformToUrlFriendly(data.title)}
                  >
                    <div className='flex items-center gap-3'>
                      <Avatar shape='rounded' color='primary' className='bs-[44px] is-[44px]'>
                        <AvatarFallback>
                          <DynamicIcon icon={data.icon} className='text-[2rem]' />
                        </AvatarFallback>
                      </Avatar>
                      <h2 className='text-textPrimary text-xl font-semibold'>{data.title}</h2>
                    </div>
                    <Accordion type='single' collapsible className='is-full' variant='outline'>
                      {filteredFaqData
                        .filter(faq => faq.category_id === data.id)
                        .map((faq, index) => (
                          <AccordionItem key={faq.id} value={`item-${index}`}>
                            <AccordionTrigger>{faq.title}</AccordionTrigger>
                            <AccordionContent>
                              <div
                                className='[&_a]:text-primary'
                                dangerouslySetInnerHTML={{ __html: faq.description }}
                              ></div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                    </Accordion>
                  </div>
                ))}
              {othersFaqData.length > 0 && (
                <>
                  <div className='flex items-center gap-3'>
                    <Avatar shape='rounded' color='primary' className='bs-[44px] is-[44px]'>
                      <AvatarFallback>
                        <TbDotsCircleHorizontal className='bs-6 is-6' />
                      </AvatarFallback>
                    </Avatar>
                    <h2 className='text-textPrimary text-xl font-semibold capitalize'>
                      <Trans i18nKey='front-pages:faqsOthersTitle' />
                    </h2>
                  </div>
                  <Accordion type='single' collapsible className='is-full' variant='outline'>
                    {othersFaqData.map((faq, index) => (
                      <AccordionItem key={faq.id} value={`item-${index}`}>
                        <AccordionTrigger className='capitalize'>{faq.title}</AccordionTrigger>
                        <AccordionContent>
                          <div
                            className='[&_a]:text-primary'
                            dangerouslySetInnerHTML={{ __html: faq.description }}
                          ></div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className='bs-full mlb-10 max-sm:mli-6 flex flex-col items-center justify-center gap-y-2'>
          <h1 className='text-textPrimary text-2xl font-medium'>
            <Trans i18nKey='front-pages:faqsNoFaqsTitle' />
          </h1>
          <p className='text-textSecondary text-center'>
            <Trans i18nKey='front-pages:faqsNoFaqsDesc' />
          </p>
        </div>
      )}
    </>
  )
}

export default Details
