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
import Admin from './pages/Admin';
import './App.css';

// Opens every new page at its top. Without this the browser keeps the
// previous page's scroll position, so e.g. searching from the Home hero
// landed on /book scrolled past the top of the booking card. Only the path
// counts: the booking flow's steps change the query string and scroll
// themselves. A #anchor link (e.g. /home#rooms) scrolls to that section
// instead, waiting briefly for the page to render it.
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

// The public site: renders the Navbar and Footer around every page and maps
// each route to its page component. "/" redirects to "/home" since Home lives there.
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
          {/* The Contact page was replaced by the site footer; keep old links working. */}
          <Route path="/contact" element={<Navigate to="/home#contact" replace />} />
          <Route path="/login" element={<Login />} />
          {/* Unknown or mistyped addresses go Home instead of an empty page. */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      <Footer />
      <ChatWidget />
    </>
  );
}

// Top-level layout. The admin dashboard is its own page with its own
// sidebar and login screen, so it renders outside the public site's Navbar
// and Footer; everything else is the public site.
function App() {
  return (
    <Routes>
      <Route path="/admin/:section?/:tab?" element={<Admin />} />
      <Route path="*" element={<PublicSite />} />
    </Routes>
  );
}

export default App;
