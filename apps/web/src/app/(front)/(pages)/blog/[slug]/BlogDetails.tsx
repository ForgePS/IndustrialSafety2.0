// React Imports
import React from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbFileInvoice } from 'react-icons/tb'
import { renderers } from '@markdoc/markdoc'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import TranslatedInput from '@repo/ui/components/ui/translated-input'
import Trans from '@repo/i18n/Trans'
import { cn } from '@repo/ui/lib/utils'
import type { RenderableTreeNode } from '@markdoc/markdoc'

// Component Imports
import TableOfContents from './TableOfContents'
import ShareLinks from './ShareLinks'

// Styles Imports
import frontCommonStyles from '../../styles.module.css'
import './blog-styles.css'

type Props = {
  postDetails: RenderableTreeNode
  latestPosts: {
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
  shareThisEnabled: boolean
}

const BlogDetails = ({ postDetails, latestPosts, shareThisEnabled }: Props) => {
  return (
    <div className={cn('plb-10 sm:plb-20', frontCommonStyles.layoutSpacing)}>
      <div className='grid gap-8 sm:gap-12 lg:grid-cols-12'>
        <div className='flex flex-col gap-8 sm:gap-12 lg:sticky lg:top-20 lg:col-span-3 lg:self-start'>
          <TableOfContents />
          <div className='border-primary bg-primary/10 rounded-xl border p-6'>
            <p className='text-primary mbe-4 text-xl font-semibold'>
              <Trans i18nKey='front-pages:blogLaravelStarterKit' />
            </p>
            <Button className='is-full' asChild>
              <Link href='https://demos.themeselection.com/jetship-laravel-starter-kit' target='_blank'>
                <Trans i18nKey='front-pages:blogGrabItNow' />
              </Link>
            </Button>
          </div>
        </div>
        <div className='flex items-start gap-6 max-sm:flex-col lg:col-span-9'>
          <div className='is-full flex flex-col gap-6'>
            <Card className='rounded-xl border shadow-none'>
              <CardContent id='blog-content' className='blog-styles pbs-6'>
                {renderers.react(postDetails, React)}
              </CardContent>
            </Card>
            <div className='border-primary sm:plb-9 sm:pli-12 flex flex-col items-center gap-7 rounded-xl border bg-cover bg-center bg-no-repeat p-6 [background-image:url(/images/pages/hero-bg.png)]'>
              <div className='flex flex-col gap-1 text-center'>
                <p className='text-primary text-base'>
                  <Trans i18nKey='front-pages:blogStayUpToDate' />
                </p>
                <h3 className='text-textPrimary text-3xl font-semibold'>
                  <Trans i18nKey='front-pages:blogSubscribeNewsletter' />
                </h3>
                <p className='text-textSecondary text-base'>
                  <Trans i18nKey='front-pages:blogNeverMissUpdates' />
                </p>
              </div>
              <TranslatedInput size='lg' translationKey='front-pages:emailPlaceholderText' className='max-is-[400px]' />
              <Button>
                <Trans i18nKey='front-pages:blogSubscribeButton' />
              </Button>
            </div>
          </div>
          {shareThisEnabled && <ShareLinks />}
        </div>
      </div>
      <hr className='border-border mlb-8 sm:mlb-12' />
      <div className='flex flex-col items-start gap-6'>
        <div className='flex items-center gap-3'>
          <TbFileInvoice className='text-2xl' />
          <p className='text-textPrimary text-xl font-semibold'>
            <Trans i18nKey='front-pages:blogLatestBlogs' />
          </p>
        </div>
        <div className='mbs-0 is-full grid gap-x-6 gap-y-12 md:grid-cols-3'>
          {latestPosts
            .filter(post => post.entry.publishedAt?.discriminant)
            .map((post, index) => (
              <Card
                key={index}
                className='max-md:max-is-[496px] max-md:mli-auto md:is-full rounded-xl border shadow-none'
              >
                <Link href={`/blog/${post.slug}`}>
                  <img
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
        </div>
      </div>
    </div>
  )
}

export default BlogDetails
