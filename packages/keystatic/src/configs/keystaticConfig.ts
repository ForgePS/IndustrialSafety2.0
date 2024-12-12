// React Imports
import { createElement } from 'react'

// Third-party Imports
import { config, fields, collection } from '@keystatic/core'

export default config({
  storage: {
    kind: 'local'
  },
  collections: {
    categories: collection({
      label: 'Categories',
      slugField: 'name',
      path: 'src/cms-content/categories/*',
      schema: {
        name: fields.slug({ name: { label: 'Name' } }),
        isFeatured: fields.checkbox({
          label: 'Is Featured?'
        })
      }
    }),
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/cms-content/posts/*',
      entryLayout: 'content',
      format: { contentField: 'body' },
      schema: {
        title: fields.slug({ name: { label: 'Title', validation: { isRequired: true } } }),
        description: fields.text({ label: 'Description', validation: { isRequired: true } }),
        featuredImage: fields.image({
          label: 'Featured Image',
          description: 'The image to display at the top of the post.',
          directory: 'public/images/blog',
          publicPath: '/images/blog',
          validation: { isRequired: true }
        }),
        categories: fields.array(
          fields.relationship({
            label: 'Category',
            collection: 'categories',
            validation: { isRequired: true }
          }),
          {
            label: 'Categories',
            itemLabel: props => props.value ?? '',
            validation: {
              length: {
                min: 1
              }
            }
          }
        ),
        publishedAt: fields.conditional(
          fields.checkbox({
            label: 'Is Published?',
            defaultValue: false
          }),
          {
            true: fields.datetime({
              label: 'Published At',
              defaultValue: {
                kind: 'now'
              },
              validation: { isRequired: true }
            }),
            false: fields.empty()
          }
        ),
        body: fields.markdoc({
          label: 'Body',
          options: {
            image: {
              directory: 'public/images/blog',
              publicPath: '/images/blog',
              schema: {
                title: fields.text({
                  label: 'Caption',
                  description: 'The text to display under the image in a caption.'
                })
              }
            }
          }
        })
      }
    })
  },
  ui: {
    brand: {
      name: 'ChatFlow AI',
      mark: () => createElement('img', { src: '/images/logos/chatflow-ai.png', alt: 'ChatFlow AI Logo', width: 24 })
    },
    navigation: {
      Blog: ['categories', 'posts']
    }
  }
})
