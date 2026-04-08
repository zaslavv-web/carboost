import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import RoleDashboard from "@/pages/RoleDashboard";
import Assessment from "@/pages/Assessment";
import Passport from "@/pages/Passport";
import CareerTrack from "@/pages/CareerTrack";
import Notifications from "@/pages/Notifications";
import ManagerDashboard from "@/pages/ManagerDashboard";
import HRDDashboard from "@/pages/HRDDashboard";
import SuperadminDashboard from "@/pages/SuperadminDashboard";
import UsersManagement from "@/pages/UsersManagement";
import Support from "@/pages/Support";
import Scenarios from "@/pages/Scenarios";
import HRPolicies from "@/pages/HRPolicies";
import Positions from "@/pages/Positions";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ImpersonationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<RoleDashboard />} />
                <Route path="/assessment" element={<Assessment />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/career-track" element={<CareerTrack />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/team" element={<ManagerDashboard />} />
                <Route path="/employees" element={<HRDDashboard />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/superadmin" element={<SuperadminDashboard />} />
                <Route path="/users" element={<UsersManagement />} />
                <Route path="/support" element={<Support />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/hr-policies" element={<HRPolicies />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ImpersonationProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
