import { Fragment } from 'react'

import { parseKnowledgeBody } from '@/lib/forgeHelpdesk'

const Inline = ({ text }: { text: string }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>
    )}
  </>
)

// Renders the Help Center Markdown subset as React nodes (no HTML injection).
const KnowledgeBody = ({ body }: { body: string }) => (
  <div className='flex flex-col gap-3 text-sm leading-6'>
    {parseKnowledgeBody(body).map((block, index) => {
      if (block.type === 'heading') {
        return block.level === 2 ? (
          <h2 key={index} className='text-textPrimary mt-2 text-lg font-semibold'>
            <Inline text={block.text} />
          </h2>
        ) : (
          <h3 key={index} className='text-textPrimary mt-1 font-semibold'>
            <Inline text={block.text} />
          </h3>
        )
      }

      if (block.type === 'list') {
        const ListTag = block.ordered ? 'ol' : 'ul'

        return (
          <ListTag key={index} className={(block.ordered ? 'list-decimal' : 'list-disc') + ' flex flex-col gap-1 pl-6'}>
            {block.items.map((item, i) => (
              <li key={i}>
                <Inline text={item} />
              </li>
            ))}
          </ListTag>
        )
      }

      return (
        <p key={index}>
          <Inline text={block.text} />
        </p>
      )
    })}
  </div>
)

export default KnowledgeBody
