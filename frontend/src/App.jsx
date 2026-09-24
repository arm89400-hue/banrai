import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Booking from './pages/Booking';
import Activity from './pages/Activity';
import About from './pages/About';
import Login from './pages/Login';
import Admin from './pages/Admin';
import './App.css';

// Top-level layout: renders the Navbar and Footer on every page and maps each route
// to its page component. "/" redirects to "/home" since Home lives there.
function App() {
  return (
    <>
      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/activities" element={<Activity />} />
          <Route path="/about" element={<About />} />
          {/* The Contact page was replaced by the site footer; keep old links working. */}
          <Route path="/contact" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/:section?" element={<Admin />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}

export default App;
