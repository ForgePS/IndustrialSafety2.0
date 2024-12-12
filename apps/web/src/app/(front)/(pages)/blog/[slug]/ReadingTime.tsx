'use client'

// React Imports
import { useEffect, useState } from 'react'

const calculateReadingTime = (text: string, wordsPerMinute: number = 200) => {
  const wordCount = text.trim().split(/\s+/).length
  const readingTime = Math.ceil(wordCount / wordsPerMinute)

  return `${readingTime} minute${readingTime > 1 ? 's' : ''}`
}

const ReadingTime = () => {
  const [readingTime, setReadingTime] = useState<string>('')

  useEffect(() => {
    const blogContentDiv = document.getElementById('blog-content')

    // Use innerText to get the text content
    const contentText = blogContentDiv?.innerText
    const time: string = calculateReadingTime(contentText ?? '')

    setReadingTime(time)
  }, [])

  return <>{readingTime}</>
}

export default ReadingTime
