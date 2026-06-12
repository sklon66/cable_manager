import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Editor2DPage from './pages/editor2d/Editor2DPage';
import Toast from './components/Toast';

// three.js + r3f only load when the 3D view is opened
const Scene3DPage = lazy(() => import('./pages/scene3d/Scene3DPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Editor2DPage />} />
        <Route path="/3d" element={<Suspense fallback={null}><Scene3DPage /></Suspense>} />
      </Routes>
      <Toast />
    </BrowserRouter>
  );
}
