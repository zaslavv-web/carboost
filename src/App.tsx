import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
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
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
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
              <Route path="/roles" element={<HRDDashboard />} />
              <Route path="/superadmin" element={<SuperadminDashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
