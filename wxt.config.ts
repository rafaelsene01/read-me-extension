import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TTS Reader',
    permissions: ['storage', 'tts', 'sidePanel', 'scripting', 'activeTab'],
    optional_host_permissions: ['<all_urls>'],
  },
});
