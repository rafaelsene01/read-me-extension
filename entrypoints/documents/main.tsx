import { createRoot } from 'react-dom/client';
import App from './App';
import { startPageLocale, t } from '../../lib/i18n';
import { getPrefs } from '../../lib/storage';
import '../sidepanel/style.css';

startPageLocale((await getPrefs()).uiLang);
document.title = `ReadMe — ${t('Documentos')}`;
createRoot(document.getElementById('root')!).render(<App />);
