import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { MotionProvider } from './components/motion.js';
import { FavouritesProvider } from './features/favourites/Favourites.js';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <MotionProvider>
    <FavouritesProvider>
      <App />
    </FavouritesProvider>
  </MotionProvider>,
);
