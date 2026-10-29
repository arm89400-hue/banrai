import { useEffect, useState } from 'react';
import { api } from './api';

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
