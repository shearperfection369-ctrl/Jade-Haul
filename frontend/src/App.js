import React from "react";
import "@/App.css";
import "leaflet/dist/leaflet.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import AppShell from "@/components/layout/AppShell";
import DriverDashboard from "@/pages/DriverDashboard";
import GpsPage from "@/pages/GpsPage";
import EldLogsPage from "@/pages/EldLogsPage";
import DetentionPage from "@/pages/DetentionPage";
import BillScannerPage from "@/pages/BillScannerPage";
import WeighStationsPage from "@/pages/WeighStationsPage";
import JadeChatPage from "@/pages/JadeChatPage";
import SafetyPage from "@/pages/SafetyPage";
import LoadBoardPage from "@/pages/LoadBoardPage";
import MessagesPage from "@/pages/MessagesPage";
import SettingsPage from "@/pages/SettingsPage";
import BrokerDashboard from "@/pages/BrokerDashboard";
import BrokerQuotePage from "@/pages/BrokerQuotePage";
import BrokerCarriersPage from "@/pages/BrokerCarriersPage";
import BrokerExceptionsPage from "@/pages/BrokerExceptionsPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import IntegrationViewerPage from "@/pages/IntegrationViewerPage";
import SettlementsPage from "@/pages/SettlementsPage";
import DispatchPage from "@/pages/DispatchPage";
import PublicTrackPage from "@/pages/PublicTrackPage";
import TripBuilderPage from "@/pages/TripBuilderPage";
import MaintenancePage from "@/pages/MaintenancePage";
import DocumentsPage from "@/pages/DocumentsPage";
import FuelReceiptsPage from "@/pages/FuelReceiptsPage";

const Protected = ({ children, role }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Booting JadeOS…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === "broker" ? "/broker" : "/driver"} replace />;
  return children;
};

const RoleRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "broker" ? "/broker" : "/driver"} replace />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="App jade-grain">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/track/:loadId" element={<PublicTrackPage />} />

              <Route element={<Protected><AppShell /></Protected>}>
                {/* Driver */}
                <Route path="/driver" element={<Protected role="driver"><DriverDashboard /></Protected>} />
                <Route path="/driver/gps" element={<Protected role="driver"><GpsPage /></Protected>} />
                <Route path="/driver/logs" element={<Protected role="driver"><EldLogsPage /></Protected>} />
                <Route path="/driver/detention" element={<Protected role="driver"><DetentionPage /></Protected>} />
                <Route path="/driver/scan" element={<Protected role="driver"><BillScannerPage /></Protected>} />
                <Route path="/driver/weigh" element={<Protected role="driver"><WeighStationsPage /></Protected>} />
                <Route path="/driver/jade" element={<Protected role="driver"><JadeChatPage /></Protected>} />
                <Route path="/driver/safety" element={<Protected role="driver"><SafetyPage /></Protected>} />
                <Route path="/driver/loads" element={<Protected role="driver"><LoadBoardPage /></Protected>} />
                <Route path="/driver/messages" element={<Protected role="driver"><MessagesPage /></Protected>} />
                <Route path="/driver/dispatch" element={<Protected role="driver"><DispatchPage /></Protected>} />
                <Route path="/driver/settlements" element={<Protected role="driver"><SettlementsPage /></Protected>} />
                <Route path="/driver/trip" element={<Protected role="driver"><TripBuilderPage /></Protected>} />
                <Route path="/driver/maintenance" element={<Protected role="driver"><MaintenancePage /></Protected>} />
                <Route path="/driver/documents" element={<Protected role="driver"><DocumentsPage /></Protected>} />
                <Route path="/driver/fuel" element={<Protected role="driver"><FuelReceiptsPage /></Protected>} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/integrations/:id" element={<IntegrationViewerPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Broker */}
                <Route path="/broker" element={<Protected role="broker"><BrokerDashboard /></Protected>} />
                <Route path="/broker/quote" element={<Protected role="broker"><BrokerQuotePage /></Protected>} />
                <Route path="/broker/carriers" element={<Protected role="broker"><BrokerCarriersPage /></Protected>} />
                <Route path="/broker/exceptions" element={<Protected role="broker"><BrokerExceptionsPage /></Protected>} />
                <Route path="/broker/dispatch" element={<Protected role="broker"><DispatchPage /></Protected>} />
                <Route path="/broker/settlements" element={<Protected role="broker"><SettlementsPage /></Protected>} />
                <Route path="/broker/jade" element={<JadeChatPage />} />
              </Route>

              <Route path="*" element={<RoleRedirect />} />
            </Routes>
            <Toaster />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
