import { createRoot } from 'react-dom/client';
import App from './App';
import { startPageLocale } from '../../lib/i18n';
import { getPrefs } from '../../lib/storage';
import './style.css';

startPageLocale((await getPrefs()).uiLang);
createRoot(document.getElementById('root')!).render(<App />);
