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
import EmployeeMapPage from "@/pages/EmployeeMapPage";
import SuperadminDashboard from "@/pages/SuperadminDashboard";
import SeedDemoCompany from "@/pages/SeedDemoCompany";
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
import EarnCoins from "@/pages/EarnCoins";

import ShopProductDetail from "@/pages/ShopProductDetail";
import Cart from "@/pages/Cart";
import MyOrders from "@/pages/MyOrders";
import ShopAdmin from "@/pages/ShopAdmin";
import Onboarding from "@/pages/Onboarding";
import AdaptationPlans from "@/pages/AdaptationPlans";
import IndividualDevelopmentPlans from "@/pages/IndividualDevelopmentPlans";
import KnowledgeBase from "@/pages/KnowledgeBase";
import Invitations from "@/pages/Invitations";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import PricingInquiries from "@/pages/PricingInquiries";
import EmailSettingsManagement from "@/pages/EmailSettingsManagement";
import FeaturePage from "@/pages/FeaturePage";
import NotFound from "@/pages/NotFound";
import Recognition from "@/pages/Recognition";
import RiskAnalytics from "@/pages/RiskAnalytics";
import EmployeeQuestionnaire from "@/pages/EmployeeQuestionnaire";
import ScrollToTop from "@/components/ScrollToTop";
import AnalyticsBootstrap from "@/components/AnalyticsBootstrap";
import ProductAnalytics from "@/pages/ProductAnalytics";
import SuperadminOnly from "@/components/SuperadminOnly";
import RoleOnly from "@/components/RoleOnly";
import UserProfileFull from "@/pages/UserProfileFull";
import Chats from "@/pages/Chats";
import Leaves from "@/pages/Leaves";
import Performance from "@/pages/Performance";
import TalentReview from "@/pages/TalentReview";
import PredictiveAnalytics from "@/pages/PredictiveAnalytics";
import Kedo from "@/pages/Kedo";
import Security from "@/pages/Security";
import SsoCallback from "@/pages/SsoCallback";
import MyDocuments from "@/pages/employee/MyDocuments";
import Probation from "@/pages/Probation";
import Disciplinary from "@/pages/Disciplinary";
import SkillsMatrix from "@/pages/SkillsMatrix";
import PerformanceReview360 from "@/pages/PerformanceReview360";
import CorporateFeed from "@/pages/CorporateFeed";
import Communities from "@/pages/Communities";
import PulseSurveys from "@/pages/PulseSurveys";
import HrDocumentsPersonal from "@/pages/HrDocumentsPersonal";
import PeopleAnalytics from "@/pages/PeopleAnalytics";
import Integrations from "@/pages/Integrations";
import IntegrationOneC from "@/pages/IntegrationOneC";

import { ChatProvider } from "@/contexts/ChatContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import CompanyBranding from "@/pages/CompanyBranding";
import AiSettings from "@/pages/AiSettings";
import RagDocuments from "@/pages/RagDocuments";
import University from "@/pages/University";
import UniversityAnalytics from "@/pages/UniversityAnalytics";
import CourseView from "@/pages/CourseView";
import CourseAuthoring from "@/pages/CourseAuthoring";
import CertificateView from "@/pages/CertificateView";
import TrackerLayout from "@/pages/tracker/TrackerLayout";
import TrackerDashboard from "@/pages/tracker/TrackerDashboard";
import TrackerGoals from "@/pages/tracker/TrackerGoals";
import TrackerTasks from "@/pages/tracker/TrackerTasks";
import TrackerOneOnOnes from "@/pages/tracker/TrackerOneOnOnes";
import TrackerProjects from "@/pages/tracker/TrackerProjects";
import TrackerBoard from "@/pages/tracker/TrackerBoard";
import TrackerWorkflows from "@/pages/tracker/TrackerWorkflows";
import TrackerBacklog from "@/pages/tracker/TrackerBacklog";
import TrackerMyBacklog from "@/pages/tracker/MyBacklog";
import MyProfile from "@/pages/MyProfile";
import InvestorDeck from "@/pages/investor/InvestorDeck";
import ComfortCompany from "@/pages/analytics/comfort/ComfortCompany";
import ComfortDepartment from "@/pages/analytics/comfort/ComfortDepartment";
import ComfortEmployee from "@/pages/analytics/comfort/ComfortEmployee";
import Initiatives from "@/pages/Initiatives";
import HrdToday from "@/pages/hrd/Today";
import { Navigate } from "react-router-dom";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Транспортный клиент сам повторяет только временные 503/db_busy.
      // Второй слой retry здесь умножал один GET до 12 HTTP-запросов.
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const ProtectedAppShell = () => (
  <ImpersonationProvider>
    <ProtectedRoute>
      <BrandingProvider>
        <ChatProvider>
          <RoleAwareLayout />
        </ChatProvider>
      </BrandingProvider>
    </ProtectedRoute>
  </ImpersonationProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
            <ScrollToTop />
            <AnalyticsBootstrap />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/investor-deck" element={<InvestorDeck />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/feature/:slug" element={<FeaturePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/sso" element={<SsoCallback />} />
              <Route element={<ProtectedAppShell />}>
                <Route path="/dashboard" element={<RoleDashboard />} />
                <Route path="/today" element={<HrdToday />} />
                <Route path="/complete-registration" element={<CompleteRegistration />} />
                <Route path="/assessment" element={<Assessment />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/me" element={<MyProfile />} />
                <Route path="/employee-questionnaire" element={<EmployeeQuestionnaire />} />
                <Route path="/career-track" element={<CareerTrack />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/team" element={<ManagerDashboard />} />
                <Route path="/employees" element={<HRDDashboard />} />
                <Route
                  path="/employee-map"
                  element={
                    <RoleOnly roles={["hrd", "hr", "company_admin", "manager", "superadmin"]} fallback="/employees">
                      <EmployeeMapPage />
                    </RoleOnly>
                  }
                />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/product-analytics" element={<SuperadminOnly><ProductAnalytics /></SuperadminOnly>} />
                <Route path="/superadmin" element={<SuperadminDashboard />} />
                <Route path="/superadmin/demo-seed" element={<SuperadminOnly><SeedDemoCompany /></SuperadminOnly>} />
                <Route path="/companies" element={<Companies />} />
                <Route path="/users" element={<UsersManagement />} />
                <Route path="/users/:userId" element={<UserProfileFull />} />
                <Route path="/support" element={<Support />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/hr-policies" element={<HRPolicies />} />
                <Route path="/hr-documents" element={<HrDocumentsPersonal />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/career-tracks" element={<CareerTracksManagement />} />
                <Route path="/career-tracks-mgmt" element={<CareerTracksManagement />} />
                <Route path="/career-tracks/employee/:userId" element={<EmployeeCareerTrack />} />

                <Route path="/career-reviews" element={<CareerReviews />} />
                <Route path="/gamification" element={<RoleOnly roles={["hrd", "hr", "company_admin"]} fallback="/shop"><GamificationManagement /></RoleOnly>} />
                <Route path="/tests" element={<HRDTests />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:id" element={<ShopProductDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/my-orders" element={<MyOrders />} />
                <Route path="/motivation/earn" element={<EarnCoins />} />

                <Route path="/shop-admin" element={<ShopAdmin />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/adaptation-plans" element={<AdaptationPlans />} />
                <Route path="/idp" element={<IndividualDevelopmentPlans />} />
                <Route path="/knowledge-base" element={<KnowledgeBase />} />
                <Route path="/invitations" element={<Invitations />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/recognition" element={<Recognition />} />
                <Route path="/risk-analytics" element={<RiskAnalytics />} />
                <Route path="/pricing-inquiries" element={<PricingInquiries />} />
                <Route path="/email-settings" element={<SuperadminOnly><EmailSettingsManagement /></SuperadminOnly>} />
                <Route path="/chats" element={<Chats />} />
                <Route path="/chats/:conversationId" element={<Chats />} />
                <Route path="/leaves" element={<Leaves />} />
                <Route path="/hr-documents-personal" element={<HrDocumentsPersonal />} />
                <Route path="/people-analytics" element={<PeopleAnalytics />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/integrations/1c" element={<IntegrationOneC />} />
                <Route path="/analytics/comfort" element={<ComfortCompany />} />
                <Route path="/analytics/comfort/department/:id" element={<ComfortDepartment />} />
                <Route path="/analytics/comfort/user/:id" element={<ComfortEmployee />} />
                <Route path="/initiatives" element={<Initiatives />} />



                <Route path="/performance" element={<Performance />} />
                <Route path="/probation" element={<Probation />} />
                <Route path="/disciplinary" element={<Disciplinary />} />
                <Route path="/skills-matrix" element={<SkillsMatrix />} />
                <Route path="/performance-360" element={<PerformanceReview360 />} />
                <Route path="/talent-review" element={<TalentReview />} />
                <Route path="/predictive-analytics" element={<PredictiveAnalytics />} />
                <Route path="/kedo" element={<Kedo />} />
                <Route path="/security" element={<Security />} />
                <Route path="/my-documents" element={<MyDocuments />} />
                <Route path="/feed" element={<CorporateFeed />} />
                <Route path="/communities" element={<Communities />} />
                <Route path="/pulse-surveys" element={<PulseSurveys />} />
                <Route path="/surveys" element={<Navigate to="/pulse-surveys" replace />} />
                <Route path="/knowledge" element={<Navigate to="/knowledge-base" replace />} />
                <Route path="/company-branding" element={<CompanyBranding />} />
                <Route path="/ai-settings" element={<AiSettings />} />
                <Route path="/rag-documents" element={<RagDocuments />} />
                <Route path="/university" element={<University />} />
                <Route path="/university/analytics" element={<UniversityAnalytics />} />
                <Route path="/university/cert/:serial" element={<CertificateView />} />
                <Route path="/university/:courseId" element={<CourseView />} />
                <Route path="/university/:courseId/edit" element={<CourseAuthoring />} />
                <Route path="/tracker" element={<TrackerLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<TrackerDashboard />} />
                  <Route path="my-backlog" element={<TrackerMyBacklog />} />
                  <Route path="board" element={<TrackerBoard />} />
                  <Route path="projects" element={<TrackerProjects />} />
                  <Route path="workflows" element={<TrackerWorkflows />} />
                  <Route path="backlog" element={<TrackerBacklog />} />
                  <Route path="goals" element={<TrackerGoals />} />
                  <Route path="tasks" element={<TrackerTasks />} />
                  <Route path="one-on-ones" element={<TrackerOneOnOnes />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
      </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
