import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleAwareLayout from "@/components/RoleAwareLayout";
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
import Companies from "@/pages/Companies";
import ResetPassword from "@/pages/ResetPassword";
import CompleteRegistration from "@/pages/CompleteRegistration";
import Analytics from "@/pages/Analytics";
import CareerTracksManagement from "@/pages/CareerTracksManagement";
import CareerReviews from "@/pages/CareerReviews";
import GamificationManagement from "@/pages/GamificationManagement";
import HRDTests from "@/pages/HRDTests";
import Shop from "@/pages/Shop";
import ShopProductDetail from "@/pages/ShopProductDetail";
import Cart from "@/pages/Cart";
import MyOrders from "@/pages/MyOrders";
import ShopAdmin from "@/pages/ShopAdmin";
import Onboarding from "@/pages/Onboarding";
import Invitations from "@/pages/Invitations";
import Landing from "@/pages/Landing";
import FeaturePage from "@/pages/FeaturePage";
import NotFound from "@/pages/NotFound";
import Recognition from "@/pages/Recognition";
import RiskAnalytics from "@/pages/RiskAnalytics";
import ScrollToTop from "@/components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ImpersonationProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/feature/:slug" element={<FeaturePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute><RoleAwareLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<RoleDashboard />} />
                <Route path="/complete-registration" element={<CompleteRegistration />} />
                <Route path="/assessment" element={<Assessment />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/career-track" element={<CareerTrack />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/team" element={<ManagerDashboard />} />
                <Route path="/employees" element={<HRDDashboard />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/superadmin" element={<SuperadminDashboard />} />
                <Route path="/companies" element={<Companies />} />
                <Route path="/users" element={<UsersManagement />} />
                <Route path="/support" element={<Support />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/hr-policies" element={<HRPolicies />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/career-tracks-mgmt" element={<CareerTracksManagement />} />
                <Route path="/career-reviews" element={<CareerReviews />} />
                <Route path="/gamification" element={<GamificationManagement />} />
                <Route path="/tests" element={<HRDTests />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:id" element={<ShopProductDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/my-orders" element={<MyOrders />} />
                <Route path="/shop-admin" element={<ShopAdmin />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/invitations" element={<Invitations />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/recognition" element={<Recognition />} />
                <Route path="/risk-analytics" element={<RiskAnalytics />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ImpersonationProvider>
      </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
