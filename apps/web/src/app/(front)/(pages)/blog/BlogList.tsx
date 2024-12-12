'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { TbHourglassEmpty } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/ui/tabs'
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

type Props = {
  categories: {
    slug: string
    entry: {
      name: string
      isFeatured: boolean
    }
  }[]
  posts: {
    slug: string
    entry: {
      title: string
      description: string
      featuredImage: string
      categories: readonly string[]
      publishedAt:
        | {
            readonly discriminant: true
            readonly value: string
          }
        | {
            readonly discriminant: false
            readonly value: null
          }
    }
  }[]
  searchParams: Record<string, string | string[] | undefined>
}

const BlogList = ({ categories, posts, searchParams }: Props) => {
  // States
  const [selectedCategory, setSelectedCategory] = useState(searchParams.category ?? 'all')

  // Hooks
  const router = useRouter()

  // Vars
  const featuredCategories = categories.filter(category => category.entry.isFeatured)

  useEffect(() => {
    const newSearchParams = new URLSearchParams(
      Object.entries(searchParams).reduce((acc, [key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => acc.append(key, v))
        } else if (value !== undefined) {
          acc.append(key, value)
        }

        return acc
      }, new URLSearchParams())
    )

    newSearchParams.set('category', selectedCategory as string)

    if (selectedCategory === 'all') {
      newSearchParams.delete('category')
    }

    router.replace(`?${newSearchParams.toString()}`, {
      scroll: false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  return (
    <div className={cn('bs-full plb-10 sm:plb-20', frontCommonStyles.layoutSpacing)}>
      <Tabs
        defaultValue={selectedCategory as string}
        onValueChange={value => {
          setSelectedCategory(value)
        }}
        className='space-b-6 sm:space-b-12 bs-full flex flex-col'
      >
        <div className='overflow-x-auto'>
          <TabsList className='is-fit mli-auto flex justify-center'>
            <TabsTrigger value='all'>All</TabsTrigger>
            {featuredCategories.map((category, index) => (
              <TabsTrigger key={index} value={category.slug}>
                {category.entry.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent
          value='all'
          className={cn('grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3', {
            '!mbs-0': selectedCategory !== 'all',
            'flex-grow': selectedCategory === 'all'
          })}
        >
          {posts
            .filter(post => post.entry.publishedAt?.discriminant)
            .map((post, index) => (
              <Card key={index} className='rounded-xl border shadow-none'>
                <Link href={`/blog/${post.slug}`}>
                  <img
                    width='100%'
                    height='100%'
                    src={post.entry.featuredImage}
                    alt={post.entry.title}
                    className='is-full rounded-bs-xl aspect-video'
                  />
                </Link>
                <CardContent className='pbs-6 flex flex-col gap-3'>
                  <Link href={`/blog/${post.slug}`}>
                    <h5 className='text-textPrimary line-clamp-2 text-lg font-semibold'>{post.entry.title}</h5>
                  </Link>
                  <p className='text-textPrimary line-clamp-3 text-base'>{post.entry.description}</p>
                  <p className='text-textDisabled text-sm'>
                    {post.entry.publishedAt?.discriminant &&
                      new Date(post.entry.publishedAt.value).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                  </p>
                </CardContent>
              </Card>
            ))}
          {posts.filter(post => post.entry.publishedAt?.discriminant).length === 0 && (
            <div className='col-span-full flex flex-col items-center justify-center gap-4'>
              <Avatar color='secondary' size='3xl' shape='circle'>
                <AvatarFallback>
                  <TbHourglassEmpty className='text-2xl' />
                </AvatarFallback>
              </Avatar>
              <p className='text-textPrimary font-medium'>No Post Found</p>
            </div>
          )}
        </TabsContent>
        {categories.map((category, index) => (
          <TabsContent
            key={index}
            value={category.slug}
            className={cn('grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3', {
              '!mbs-0': selectedCategory !== category.slug,
              'flex-grow': selectedCategory === category.slug
            })}
          >
            {posts
              .filter(
                post =>
                  post.entry.categories.includes(selectedCategory as string) && post.entry.publishedAt?.discriminant
              )
              .map((post, i) => (
                <Card key={i} className='rounded-xl border shadow-none'>
                  <Link href={`/blog/${post.slug}`}>
                    <img
                      width='100%'
                      height='100%'
                      src={post.entry.featuredImage}
                      alt={post.entry.title}
                      className='is-full rounded-bs-xl aspect-video'
                    />
                  </Link>
                  <CardContent className='pbs-6 flex flex-col gap-3'>
                    <Link href={`/blog/${post.slug}`}>
                      <h5 className='text-textPrimary line-clamp-2 text-lg font-semibold'>{post.entry.title}</h5>
                    </Link>
                    <p className='text-textPrimary line-clamp-3 text-base'>{post.entry.description}</p>
                    <p className='text-textDisabled text-sm'>
                      {post.entry.publishedAt?.discriminant &&
                        new Date(post.entry.publishedAt.value).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            {posts.filter(
              post => post.entry.categories.includes(selectedCategory as string) && post.entry.publishedAt?.discriminant
            ).length === 0 && (
              <div className='col-span-full flex flex-col items-center justify-center gap-4'>
                <Avatar color='secondary' size='3xl' shape='circle'>
                  <AvatarFallback>
                    <TbHourglassEmpty className='text-2xl' />
                  </AvatarFallback>
                </Avatar>
                <p className='text-textPrimary font-medium'>No Post Found</p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export default BlogList
