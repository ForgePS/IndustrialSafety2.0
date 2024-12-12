// Third-party Imports
import { createKeystaticReader } from '@repo/keystatic/createReader'

// Component Imports
import HeaderSection from './HeaderSection'
import BlogList from './BlogList'

const BlogPage = async (props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  // Vars
  const searchParams = await props.searchParams
  const reader = createKeystaticReader()

  const categories = await reader.collections.categories.all()
  const posts = await reader.collections.posts.all()

  const postData = posts.map(post => ({
    slug: post.slug,
    entry: {
      title: post.entry.title,
      description: post.entry.description,
      featuredImage: post.entry.featuredImage,
      categories: post.entry.categories,
      publishedAt: post.entry.publishedAt
    }
  }))

  return (
    <>
      <HeaderSection />
      <BlogList categories={categories} posts={postData} searchParams={searchParams} />
    </>
  )
}

export default BlogPage
