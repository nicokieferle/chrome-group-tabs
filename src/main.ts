import { createApp } from 'vue'
import Options from './Options.vue'
import Popup from './Popup.vue'

const popup = new URL(location.href).searchParams.get('context') === 'popup'
document.documentElement.lang = 'de'
document.documentElement.dataset.context = popup ? 'popup' : 'options'
document.title = popup ? 'Tabgruppen · Once' : 'Tabgruppen · Einstellungen'
createApp(popup ? Popup : Options).mount('#app')
