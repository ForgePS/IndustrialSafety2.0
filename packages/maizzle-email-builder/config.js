/*
|-------------------------------------------------------------------------------
| Development config                      https://maizzle.com/docs/environments
|-------------------------------------------------------------------------------
|
| The exported object contains the default Maizzle settings for development.
| This is used when you run `maizzle build` or `maizzle serve` and it has
| the fastest build time, since most transformations are disabled.
|
*/

/** @type {import('@maizzle/framework').Config} */
module.exports = {
  build: {
    templates: {
      source: 'src/templates',
      destination: {
        path: 'build_local'
      },
      assets: {
        source: 'src/images',
        destination: 'images'
      }
    }
  },
  locals: {
    saas_startup_name: 'JetShip',
    app_url: 'http://localhost:3000',
    support_center_url: 'https://discord.com/invite/kBHkY7DekX',
    support_email: 'hello@themeselection.com',
    docs_url: 'https://demos.themeselection.com/jetship-nextjs-boilerplate/documentation',
    github_url: 'https://github.com/themeselection',
    twitter_url: 'https://x.com/Theme_Selection'
  }
}
