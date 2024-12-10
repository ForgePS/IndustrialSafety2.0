'use client'

// Next Imports
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { TbDotsCircleHorizontal } from 'react-icons/tb'
import { cn } from '@repo/ui/lib/utils'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@repo/ui/components/ui/accordion'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'

// Type Imports
import type { FaqWithCategory } from '@/app/(back)/admin/faqs/faq/Faq'
import type { CategoryTypes } from '@/app/(back)/admin/faqs/category/Categories'

// Component Imports
import { DynamicIcon } from '@/app/(back)/admin/faqs/category/Categories'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const Details = ({ categoryData, faqData }: { categoryData: CategoryTypes[]; faqData: FaqWithCategory[] }) => {
  // Hooks
  const searchParams = useSearchParams()

  // Vars
  const search = searchParams.get('search') || ''

  const filteredFaqData = faqData.filter(faq => faq.title.toLowerCase().includes(search.toLowerCase()))

  // Filter FAQs that don't have a category (for "Others" section)
  const othersFaqData = filteredFaqData.filter(faq => !faq.categoryId)

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
              <h2 className='text-textPrimary text-xl font-semibold'>Enter Your Details</h2>
              <ul className='bg-card flex flex-col gap-y-4 rounded-md border p-6'>
                {categoryData
                  .filter(category => filteredFaqData.some(faq => faq.categoryId === category.id))
                  .map((data: CategoryTypes) => (
                    <li key={data.id} className='text-textSecondary flex items-center gap-2'>
                      {DynamicIcon(data.icon)}
                      <Link href={`#${transformToUrlFriendly(data.title)}`} className='truncate font-medium capitalize'>
                        {data.title}
                      </Link>
                    </li>
                  ))}

                {othersFaqData.length > 0 && (
                  <li className='text-textSecondary flex items-center gap-2'>
                    <TbDotsCircleHorizontal className='bs-6 is-6' />
                    <Link href='#others' className='truncate font-medium capitalize'>
                      Others
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </aside>
          <div className='lg:col-span-3'>
            <div className='flex flex-col gap-y-8'>
              {categoryData
                .filter(category => filteredFaqData.some(faq => faq.categoryId === category.id)) // Only render categories with matching FAQs
                .map((data: CategoryTypes) => (
                  <div
                    key={data.id}
                    className='flex scroll-mt-20 flex-col items-start gap-3'
                    id={transformToUrlFriendly(data.title)}
                  >
                    <div className='flex items-center gap-3'>
                      <Avatar shape='rounded' color='primary' className='bs-[44px] is-[44px]'>
                        <AvatarFallback>{DynamicIcon(data.icon)}</AvatarFallback>
                      </Avatar>
                      <h2 className='text-textPrimary text-xl font-semibold capitalize'>{data.title}</h2>
                    </div>
                    <Accordion type='single' collapsible className='is-full' variant='outline'>
                      {filteredFaqData
                        .filter(faq => faq.categoryId === data.id)
                        .map((faq, index) => (
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
                    <h2 className='text-textPrimary text-xl font-semibold capitalize'>Others</h2>
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
          <h1 className='text-textPrimary text-2xl font-medium'>No FAQs Available</h1>
          <p className='text-textSecondary text-center'>
            There are no FAQs available at the moment. Please check back later for more information.
          </p>
        </div>
      )}
    </>
  )
}

export default Details
