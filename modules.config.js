const prodModules = [
  [
    'nuxt-bugsnag',
    {
      apiKey: process.env.APP_BUGSNAG_KEY,
      config: {
        appVersion: process.env.npm_package_version,
        releaseStage: process.env.APP_ENV || 'development',
        enabledReleaseStages: ['production', 'testnet']
      },
      publishRelease: true
    }
  ]
]

module.exports = [
  ...[
    '@nuxtjs/pwa',
    'portal-vue/nuxt',
    '@nuxtjs/toast',
    '@nuxtjs/google-gtag',
    '@nuxtjs/sitemap'
  ],
  ...(process.env.NODE_ENV === 'production' ? prodModules : [])
]