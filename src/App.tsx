import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Eagerly load the landing page; lazy-load everything else
import Index from "./pages/Index";

const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const StudentScorecard = lazy(() => import("./pages/StudentScorecard"));
const Statistics = lazy(() => import("./pages/Statistics"));
const ProjectOverview = lazy(() => import("./pages/ProjectOverview"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Guide = lazy(() => import("./pages/Guide"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const StudentFeedback = lazy(() => import("./pages/StudentFeedback"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function ProtectedRoutes() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/project/:id/student/:studentId" element={<StudentScorecard />} />
          <Route path="/project/:id/overzicht" element={<ProjectOverview />} />
          <Route path="/statistieken" element={<Statistics />} />
          <Route path="/profiel" element={<Profile />} />
          <Route path="/admin/gebruikers" element={<AdminUsers />} />
          <Route path="/handleiding" element={<Guide />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/student/feedback/:shareToken" element={<StudentFeedback />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Login />;
}

export default App;
