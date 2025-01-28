// Third-party Imports
import Trans from '@repo/i18n/Trans'

// Type Imports
import type { Database } from '@repo/supabase/types'

// Component Imports
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@repo/ui/components/ui/accordion'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type FAQType = Database['public']['Tables']['faqs']['Row']

type Props = {
  data: FAQType[]
  accordionCollapsible?: boolean
  accordionType?: 'single' | 'multiple'
  accordionVariant?: 'split' | 'outline' | 'default'
  className?: string
}

const FAQ = (props: Props) => {
  // Props
  const { data, className, accordionCollapsible = true, accordionType = 'single', accordionVariant = 'default' } = props

  return (
    <>
      {data.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center gap-y-2 text-center', className)}>
          <h1 className='text-textPrimary text-2xl font-medium'>
            <Trans i18nKey='packages-ui:faqNoFaqsTitle' />
          </h1>
          <p className='text-textSecondary'>
            <Trans i18nKey='packages-ui:faqNoFaqsDescription' />
          </p>
        </div>
      ) : accordionType === 'single' ? (
        <Accordion
          type='single'
          variant={accordionVariant}
          collapsible={accordionCollapsible}
          defaultValue='item-0'
          className={cn('is-full', className)}
        >
          {data.map((faq: FAQType, index: number) => (
            <AccordionItem key={faq.id} value={`item-${index}`}>
              <AccordionTrigger className='text-start'>{faq.title}</AccordionTrigger>
              <AccordionContent>
                <div className='[&_a]:text-primary' dangerouslySetInnerHTML={{ __html: faq.description }}></div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <Accordion type='multiple' variant={accordionVariant} className={cn('is-full', className)}>
          {data.map((faq: FAQType, index: number) => (
            <AccordionItem key={faq.id} value={`item-${index}`}>
              <AccordionTrigger className='text-start'>{faq.title}</AccordionTrigger>
              <AccordionContent>
                <div className='[&_a]:text-primary' dangerouslySetInnerHTML={{ __html: faq.description }}></div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </>
  )
}

export default FAQ
