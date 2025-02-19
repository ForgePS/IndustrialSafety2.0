// Next Imports
import { redirect } from 'next/navigation'
import type { Metadata, ResolvingMetadata } from 'next'

// Third-party Imports
import { transform, validate } from '@markdoc/markdoc'
import { getPublicGeneralSettings } from '@repo/supabase/serverHelpers'
import { createKeystaticReader } from '@repo/keystatic/createReader'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import HeaderSection from './HeaderSection'
import BlogDetails from './BlogDetails'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  // vars
  const params = await props.params
  const reader = await createKeystaticReader()

  const post = await reader.collections.posts.read(params.slug)

  const previousImages = (await parent).openGraph?.images ?? []

  return {
    title: {
      absolute: post?.title ? `Blog - ${post?.title}` : 'Blog'
    },
    description: post?.description,
    openGraph: {
      images: [
        (post?.featuredImage.startsWith('http')
          ? post?.featuredImage
          : `${process.env.BASEPATH}${post?.featuredImage}`) ?? '',
        ...previousImages
      ]
    },
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!),
    alternates: {
      canonical: `https://jetship-nextjs-saas-boilerplate-demo.vercel.app/blog/${params.slug}`
    }
  }
}

const PostPage = async (props: Props) => {
  // Vars
  const params = await props.params
  const reader = await createKeystaticReader()
  const { data: settings_configuration } = await getPublicGeneralSettings()

  const post = await reader.collections.posts.read(params.slug)
  const posts = await reader.collections.posts.all()
  const categories = await reader.collections.categories.all()

  const latestPosts = posts
    .filter(p => p.slug !== params.slug && p.entry.publishedAt.discriminant)
    .sort(
      (a, b) =>
        new Date(b.entry.publishedAt.value as string).getTime() -
        new Date(a.entry.publishedAt.value as string).getTime()
    )
    .slice(0, 3)
    .map(post => {
      return {
        slug: post.slug,
        entry: {
          title: post.entry.title,
          description: post.entry.description,
          featuredImage: post.entry.featuredImage.startsWith('http')
            ? post.entry.featuredImage
            : `${process.env.BASEPATH}${post.entry.featuredImage}`,
          categories: post.entry.categories,
          publishedAt: post.entry.publishedAt
        }
      }
    })

  const filteredCategories = categories
    .filter(c => post?.categories.includes(c.slug))
    .map(c => ({
      slug: c.slug,
      name: c.entry.name
    }))

  const postData = {
    title: post?.title,
    description: post?.description,
    featuredImage: post?.featuredImage.startsWith('http')
      ? post?.featuredImage
      : `${process.env.BASEPATH}${post?.featuredImage}`,
    categories: filteredCategories,
    publishedAt: post?.publishedAt
  }

  if (!post || !post.publishedAt.discriminant) {
    return redirect('/page-not-found')
  }

  const { node } = await post.body()
  const errors = validate(node)

  if (errors.length) {
    console.error(errors)
    throw new Error('Invalid content')
  }

  const renderable = transform(node)

  return (
    <>
      <HeaderSection postData={postData} />
      <BlogDetails
        postDetails={renderable}
        latestPosts={latestPosts}
        shareThisEnabled={
          (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings']).share_this_enabled
        }
      />
    </>
  )
}

export default PostPage
