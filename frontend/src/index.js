import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SWRConfig } from "swr";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Global SWR config — kills the noisy auto-refetch on focus/reconnect that
// was hammering the API every time the user changed tabs.
const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  dedupingInterval: 30_000,
};

// NOTE: StrictMode intentionally disabled — react-leaflet 4 re-initializes the
// Leaflet container twice under StrictMode and throws "Map container is already
// initialized." The rest of the app is StrictMode-clean; toggle back on after
// upgrading to react-leaflet >= 5.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <QueryClientProvider client={queryClient}>
    <SWRConfig value={swrConfig}>
      <App />
    </SWRConfig>
  </QueryClientProvider>
);
