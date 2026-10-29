import { useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import PageShift from './components/PageShift';
import Home from './pages/Home';
import Booking from './pages/Booking';
import BookFlow from './pages/BookFlow';
import RoomPage from './pages/RoomPage';
import StayDashboard from './pages/StayDashboard';
import Activity from './pages/Activity';
import About from './pages/About';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import Admin from './pages/Admin';
import './App.css';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return undefined;
    }
    let frame;
    let tries = 0;
    const find = () => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView({ block: 'start' });
      else if (tries++ < 60) frame = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
  return null;
}

function PublicSite() {
  return (
    <>
      <ScrollToTop />
      <PageShift />
      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/book" element={<BookFlow />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/stay" element={<StayDashboard />} />
          <Route path="/activities" element={<Activity />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Navigate to="/home#contact" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      <Footer />
      <ChatWidget />
    </>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/admin/:section?/:tab?" element={<Admin />} />
      <Route path="*" element={<PublicSite />} />
    </Routes>
  );
}

export default App;
