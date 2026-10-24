export default {
  name: '__MSG_appName__',
  version: '0.2.2',
  manifest_version: 3,
  description: '__MSG_appDesc__',
  homepage_url: 'https://github.com/nicokieferle/chrome-group-tabs',
  icons: {
    '16': 'icons/icon16.png',
    '19': 'icons/icon19.png',
    '128': 'icons/icon128.png',
    '256': 'icons/icon256.png',
  },
  default_locale: 'en',
  options_ui: {
    open_in_tab: true,
    page: 'index.html?context=options',
  },
  action: {
    default_popup: 'index.html?context=popup',
  },
  permissions: ['tabs', 'tabGroups', 'storage'],
}
