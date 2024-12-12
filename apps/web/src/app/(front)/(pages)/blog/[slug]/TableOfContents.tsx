'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { cn } from '@repo/ui/lib/utils'

interface NestedHeading {
  id: string
  title: string
  items: NestedHeading[]
}

const getNestedHeadings = (headingElements: Element[]) => {
  const nestedHeadings: NestedHeading[] = []
  const headingStack: { level: number; heading: NestedHeading }[] = []
  const usedIds: Record<string, number> = {} // To track occurrences of each id
  let idCounter = 0 // Counter for generating fallback ids

  headingElements.forEach(heading => {
    const { innerText: title } = heading as HTMLElement

    // Generate a base id from the title
    let baseId =
      title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '') || `heading-${idCounter++}` // fallback if title is empty

    // Ensure uniqueness of the id by checking how many times this baseId has been used
    if (usedIds[baseId]) {
      const uniqueId = `${baseId}-${usedIds[baseId]}` // Append a counter to make it unique

      usedIds[baseId] += 1
      baseId = uniqueId // Update baseId with the unique id
    } else {
      usedIds[baseId] = 1
    }

    // Assign the generated id to the actual DOM element
    heading.setAttribute('id', baseId)

    const level = parseInt(heading.nodeName.replace('H', ''), 10)
    const newHeading: NestedHeading = { id: baseId, title, items: [] }

    // If it's an H1, or the stack is empty, it is the top level
    if (level === 1 || headingStack.length === 0) {
      nestedHeadings.push(newHeading)
      headingStack.length = 1 // Reset stack
      headingStack[0] = { level, heading: newHeading }
    } else {
      // Pop out headings from the stack that are of higher or equal level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop() // Remove stack levels that are equal or higher
      }

      // Attach to the last valid parent
      if (headingStack.length > 0) {
        headingStack[headingStack.length - 1].heading.items.push(newHeading)
      } else {
        nestedHeadings.push(newHeading)
      }

      // Push the current heading onto the stack
      headingStack.push({ level, heading: newHeading })
    }
  })

  return nestedHeadings
}

const useHeadingsData = () => {
  const [nestedHeadings, setNestedHeadings] = useState<NestedHeading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const blogContent = document.getElementById('blog-content')

    if (blogContent) {
      const headingElements = Array.from(blogContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))

      const newNestedHeadings = getNestedHeadings(headingElements)

      setNestedHeadings(newNestedHeadings)

      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id)
            }
          })
        },
        { rootMargin: '0px 0px -80% 0px', threshold: 0.1 }
      )

      headingElements.forEach(el => observer.observe(el))

      return () => observer.disconnect()
    }
  }, [])

  return { nestedHeadings, activeId }
}

const TableOfContents = () => {
  const { nestedHeadings, activeId } = useHeadingsData()

  const handleClick = (e: MouseEvent, id: string) => {
    e.preventDefault()
    const targetElement = document.querySelector(`#${id}`)

    if (targetElement) {
      const headerOffset = 70
      const elementPosition = targetElement.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  const renderNestedHeadings = (headings: NestedHeading[], depth = 1) => (
    <ul className='space-b-3 [&_ul]:mbs-3 flex flex-col'>
      {headings.map(heading => (
        <li
          key={heading.id}
          className={cn('text-textPrimary text-base font-medium', {
            'text-primary': activeId === heading.id,
            'pis-5': depth > 1
          })}
        >
          <Link href={`#${heading.id}`} onClick={e => handleClick(e, heading.id)}>
            {heading.title}
          </Link>
          {heading.items.length > 0 && depth < 3 && renderNestedHeadings(heading.items, depth + 1)}
        </li>
      ))}
    </ul>
  )

  return (
    <div className='flex flex-col items-start gap-6'>
      <p className='text-textPrimary text-lg font-semibold sm:text-xl'>Table of Contents</p>
      {nestedHeadings.length !== 0 && renderNestedHeadings(nestedHeadings)}
    </div>
  )
}

export default TableOfContents
