import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "@/lib/analytics/tracker";

/**
 * Монтируется внутри <BrowserRouter>: запускает трекер один раз и
 * шлёт page_view при каждом изменении маршрута.
 */
const AnalyticsBootstrap = () => {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
};

export default AnalyticsBootstrap;
