import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import { AuthProvider }     from './context/AuthContext.jsx';
import AdminRoute           from './admin/AdminRoute.jsx';
import AdminLogin           from './admin/AdminLogin.jsx';
import AdminLayout          from './admin/AdminLayout.jsx';
import AdminDashboard       from './admin/AdminDashboard.jsx';
import AdminLabelling       from './admin/AdminLabelling.jsx';
import AdminModel           from './admin/AdminModel.jsx';
import AdminCostData        from './admin/AdminCostData.jsx';
import AdminScraper         from './admin/AdminScraper.jsx';
import AdminPlaceholder     from './admin/AdminPlaceholder.jsx';
import AdminWebsiteContent  from './admin/AdminWebsiteContent.jsx';
import ClientLogin          from './pages/ClientLogin.jsx';
import HomePage             from './pages/HomePage.jsx';
import App                  from './App.jsx';
import { FiImage }          from 'react-icons/fi';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Landing + client app */}
        <Route path="/"      element={<HomePage />} />
        <Route path="/app"   element={<App />} />
        <Route path="/login" element={<ClientLogin />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin shell */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index         element={<AdminDashboard />} />
          <Route path="scraper"   element={<AdminScraper />} />
          <Route path="labelling" element={<AdminLabelling />} />
          <Route path="model"     element={<AdminModel />} />
          <Route path="artists"   element={<AdminCostData />} />
          <Route path="fb"        element={<AdminCostData />} />
          <Route path="logistics" element={<AdminCostData />} />
          <Route path="cities"    element={<AdminCostData />} />
          <Route path="decor"     element={<AdminPlaceholder icon={<FiImage />} title="Decor Library" description="Manage seed decor items. Scraped images are managed via the Labelling Queue." />} />
          <Route path="content"   element={<AdminWebsiteContent />} />
          <Route path="audit"     element={<AdminCostData />} />
          <Route path="*"         element={<Navigate to="/admin" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);