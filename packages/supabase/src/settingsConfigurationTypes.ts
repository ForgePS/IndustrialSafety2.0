export type SettingsConfiguration = {
  general_settings: {
    tracking: {
      google_tag_manager: string
      providers: [
        {
          name: string
          snippet: string
        }
      ]
    }
    social_links: Array<{
      title: string
      icon: string
      url: string
    }>
    pages_components: {
      blog_enabled: boolean
    }
    share_this_enabled: boolean
  }
}
