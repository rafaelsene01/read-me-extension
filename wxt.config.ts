import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'ReadMe',
    permissions: ['storage', 'tts', 'sidePanel', 'scripting', 'activeTab', 'contextMenus'],
    optional_host_permissions: ['<all_urls>'],
  },
});
