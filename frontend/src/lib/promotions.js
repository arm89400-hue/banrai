import { useEffect, useState } from 'react';
import { api } from './api';

// Loads the promotions guests can use (GET /api/promotions): each is
// { id, name, percent, starts_on, ends_on, room_id } with bare
// "YYYY-MM-DD" dates and room_id null for "every room". Returns [] until
// loaded, and if loading fails - prices then simply show without a discount.
export function usePromotions() {
  const [promotions, setPromotions] = useState([]);

  useEffect(() => {
    let stale = false;
    api('/api/promotions')
      .then((data) => !stale && setPromotions(data.promotions))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, []);

  return promotions;
}
