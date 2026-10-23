import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { toISODate } from './booking';
import { groupRows, needsYou } from './adminBookings';

// Loads an admin API path. Reloading keeps the old data on screen until the new
// data arrives, so lists don't flash back to a skeleton after every action.
export function useAdminData(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return api(path)
      .then((data) => alive.current && setState({ data, error: null, loading: false }))
      .catch((err) => alive.current && setState((s) => ({ data: s.data, error: err.message, loading: false })));
  }, [path]);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  return { ...state, reload };
}

// Counts shown next to the menu items: jobs on the Today page, and guests
// waiting for a reply (the same number the Messages page shows).
export function useAdminBadges(enabled, page) {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () =>
      Promise.all([api('/api/admin/stats'), api('/api/admin/bookings')])
        .then(([stats, list]) => {
          if (cancelled) return;
          const today = toISODate(new Date());
          const todo = groupRows(list.bookings).filter((g) => needsYou(g, today)).length;
          const chat = stats.stats.waiting_chats ?? stats.stats.unread_chats ?? 0;
          setBadges({ overview: todo + (chat > 0 ? 1 : 0), chat });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, page]);

  return badges;
}
