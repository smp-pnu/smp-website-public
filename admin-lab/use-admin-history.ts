import { useEffect, useRef } from "react";
import {
  readAdminRoute,
  adminHistoryKey,
  type AdminRoute,
} from "./admin-navigation";

/** Sidebar and browser history share the same unsaved-change guard. Repeated
 * Back clicks while a confirmation is open resolve to the latest destination. */
export function useAdminHistory(
  canLeave: () => Promise<boolean>,
  onNavigate: (route: AdminRoute) => Promise<void>,
) {
  const guard = useRef(canLeave),
    navigate = useRef(onNavigate);
  guard.current = canLeave;
  navigate.current = onNavigate;
  useEffect(() => {
    let index = Number(history.state?.[adminHistoryKey]) || 0;
    history.replaceState({ ...history.state, [adminHistoryKey]: index }, "");
    let observed = location.href,
      restoring = false,
      pending = false,
      live = true;
    let candidate = {
      index,
      url: location.href,
      route: readAdminRoute(location.hash),
    };
    const follow = () => {
      if (location.href === observed) return;
      observed = location.href;
      if (restoring) {
        restoring = false;
        return;
      }
      const target = Number(history.state?.[adminHistoryKey]);
      candidate = {
        index: Number.isFinite(target) ? target : index + 1,
        url: location.href,
        route: readAdminRoute(location.hash),
      };
      if (pending) return;
      pending = true;
      void (async () => {
        const accepted = await guard.current();
        if (!live) return;
        if (accepted) {
          let applied;
          do {
            applied = candidate;
            await navigate.current(applied.route);
          } while (live && applied !== candidate);
          if (!live) return;
          index = applied.index;
          history.replaceState(
            { ...history.state, [adminHistoryKey]: index },
            "",
          );
        } else {
          restoring = true;
          history.go(index - candidate.index);
        }
        pending = false;
      })();
    };
    const pushed = () => {
      index = Number(history.state?.[adminHistoryKey]) || 0;
      observed = location.href;
    };
    window.addEventListener("popstate", follow);
    window.addEventListener("hashchange", follow);
    window.addEventListener("admin-route-pushed", pushed);
    return () => {
      live = false;
      window.removeEventListener("popstate", follow);
      window.removeEventListener("hashchange", follow);
      window.removeEventListener("admin-route-pushed", pushed);
    };
  }, []);
}
