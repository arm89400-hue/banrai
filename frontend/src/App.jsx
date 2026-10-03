import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
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

// The public site: renders the Navbar and Footer around every page and maps
// each route to its page component. "/" redirects to "/home" since Home lives there.
function PublicSite() {
  return (
    <>
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
          <Route path="/contact" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Login />} />
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
      <Route path="/admin/:section?" element={<Admin />} />
      <Route path="*" element={<PublicSite />} />
    </Routes>
  );
}

export default App;
