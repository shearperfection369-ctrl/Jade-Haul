import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// NOTE: StrictMode intentionally disabled — react-leaflet 4 re-initializes the
// Leaflet container twice under StrictMode and throws "Map container is already
// initialized." The rest of the app is StrictMode-clean; toggle back on after
// upgrading to react-leaflet >= 5.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
