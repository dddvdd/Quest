import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import LoginPage from './pages/Public/LoginPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import RegisterPage from './pages/Public/RegisterPage.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import StaffLayout from './components/layout/StaffLayout.jsx'
import ScannerPage from './pages/Staff/ScannerPage.jsx'
import ManualSearchPage from './pages/Staff/ManualSearchPage.jsx'
import CheckinPage from './pages/Staff/CheckinPage.jsx'
import WalkinPage from './pages/Staff/WalkinPage.jsx'
import InterviewLogPage from './pages/Staff/InterviewLogPage.jsx'
import MedicalReferralEntry from './pages/Staff/MedicalReferralEntry.jsx'
import MedicalDashboard from './pages/Medical/MedicalDashboard.jsx'
import AdminDashboard from './pages/Admin/AdminDashboard.jsx'
import EmploymentIntelligencePage from './pages/Admin/EmploymentIntelligencePage.jsx'
import RegistrantsManagement from './pages/Admin/RegistrantsManagement.jsx'
import UsersManagement from './pages/Admin/UsersManagement.jsx'
import EventsManagement from './pages/Admin/EventsManagement.jsx'
import VacanciesManagement from './pages/Admin/VacanciesManagement.jsx'
import InterviewLogsManagement from './pages/Admin/InterviewLogsManagement.jsx'
import SupervisorLayout from './components/layout/SupervisorLayout.jsx'
import SupervisorDashboard from './pages/Supervisor/SupervisorDashboard.jsx'
import ReportsPage from './pages/Supervisor/ReportsPage.jsx'
import AdminReports from './pages/Admin/AdminReports.jsx'
import EmployerManagement from './pages/Admin/EmployerManagement.jsx'
import ApplicationTracking from './pages/Admin/ApplicationTracking.jsx'
import EmploymentOutcomes from './pages/Admin/EmploymentOutcomes.jsx'
import FollowUpTracking from './pages/Admin/FollowUpTracking.jsx'
import ProgramListPage from './pages/Admin/ProgramListPage.jsx'
import ProgramDetailPage from './pages/Admin/ProgramDetailPage.jsx'
import ProgramCyclePage from './pages/Admin/ProgramCyclePage.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'
import EmployerRegisterPage from './pages/Public/EmployerRegisterPage.jsx'
import CompleteEmployerRegistration from './pages/Public/CompleteEmployerRegistration.jsx'
import EventDetailPage from './pages/Public/EventDetailPage.jsx'
import PassPage from './pages/Public/PassPage.jsx'
import ProfilePage from './pages/Public/ProfilePage.jsx'
import WorkExperiencePage from './pages/Public/WorkExperiencePage.jsx'
import SkillSetPage from './pages/Public/SkillSetPage.jsx'
import EducationPage from './pages/Public/EducationPage.jsx'
import CertificationsPage from './pages/Public/CertificationsPage.jsx'
import LanguagesPage from './pages/Public/LanguagesPage.jsx'
import PreferencesPage from './pages/Public/PreferencesPage.jsx'
import ParticipationPage from './pages/Public/ParticipationPage.jsx'
import EmployerDashboard from './pages/Employer/EmployerDashboard.jsx'
import JobseekerRecommendationsPage from './pages/Jobseeker/JobseekerRecommendationsPage.jsx'
import EmployerCandidateRecommendationsPage from './pages/Employer/EmployerCandidateRecommendationsPage.jsx'
import JobsPage from './pages/Public/JobsPage.jsx'
import JobDetailPage from './pages/Public/JobDetailPage.jsx'
import MyApplicationsPage from './pages/Jobseeker/MyApplicationsPage.jsx'
import EmployerInboxPage from './pages/Employer/EmployerInboxPage.jsx'
import ReviewDashboard from './components/aiReview/ReviewDashboard.jsx'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { setProvider as registerStorageProvider } from './storage/storageService.js'
import { supabaseStorage } from './storage/supabaseStorage.js'

// Wire the Supabase Storage adapter as the active storage provider.
// Swap in `r2Storage` here (and only here) when migrating to R2.
registerStorageProvider(supabaseStorage)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/events/:eventId" element={<EventDetailPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:vacancyId" element={<JobDetailPage />} />
            <Route element={<ProtectedRoute roles={['applicant']} />}>
              <Route path="/pass" element={<PassPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/jobseeker/work-experience" element={<WorkExperiencePage />} />
              <Route path="/jobseeker/skill-set" element={<SkillSetPage />} />
              <Route path="/jobseeker/education" element={<EducationPage />} />
              <Route path="/jobseeker/certifications" element={<CertificationsPage />} />
              <Route path="/jobseeker/languages" element={<LanguagesPage />} />
              <Route path="/jobseeker/preferences" element={<PreferencesPage />} />
              <Route path="/jobseeker/ai-review" element={<ReviewDashboard />} />
              <Route path="/jobseeker/recommendations" element={<JobseekerRecommendationsPage />} />
              <Route path="/jobseeker/applications" element={<MyApplicationsPage />} />
            </Route>
            <Route path="/register-employer" element={<EmployerRegisterPage />} />
            <Route element={<ProtectedRoute roles={['applicant', 'employer']} />}>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/register-employer/complete" element={<CompleteEmployerRegistration />} />
              <Route path="/participation/:participationId" element={<ParticipationPage />} />
              <Route path="/ticket/:registrantId" element={<ParticipationPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['staff', 'supervisor', 'admin']} />}>
              <Route element={<StaffLayout />}>
                <Route path="/staff/scanner" element={<ScannerPage />} />
                <Route path="/staff/search" element={<ManualSearchPage />} />
                <Route path="/staff/checkin/:registrantId" element={<CheckinPage />} />
                <Route path="/staff/walkin" element={<WalkinPage />} />
                <Route path="/staff/interview-log" element={<InterviewLogPage />} />
                <Route path="/staff/medical-referral" element={<MedicalReferralEntry />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={['staff', 'supervisor', 'admin']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin/review" element={<ReviewDashboard />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={['supervisor', 'admin']} />}>
              <Route element={<SupervisorLayout />}>
                <Route path="/supervisor" element={<SupervisorDashboard />} />
                <Route path="/supervisor/reports" element={<ReportsPage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={['medical', 'admin']} />}>
              <Route path="/medical/dashboard" element={<MedicalDashboard />} />
            </Route>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/intelligence" element={<EmploymentIntelligencePage />} />
                <Route path="/admin/reports" element={<AdminReports />} />
                <Route path="/admin/registrants" element={<RegistrantsManagement />} />
                <Route path="/admin/users" element={<UsersManagement />} />
                <Route path="/admin/events" element={<EventsManagement />} />
                <Route path="/admin/vacancies" element={<VacanciesManagement />} />
                <Route path="/admin/interviews" element={<InterviewLogsManagement />} />
                <Route path="/admin/employers" element={<EmployerManagement />} />
                <Route path="/admin/applications" element={<ApplicationTracking />} />
                <Route path="/admin/outcomes" element={<EmploymentOutcomes />} />
                <Route path="/admin/follow-ups" element={<FollowUpTracking />} />
                <Route path="/admin/programs" element={<ProgramListPage />} />
                <Route path="/admin/programs/:programId" element={<ProgramDetailPage />} />
                <Route path="/admin/program-cycles/:cycleId" element={<ProgramCyclePage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={['employer']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/employer/dashboard" element={<EmployerDashboard />} />
                <Route path="/employer/ai-review" element={<ReviewDashboard />} />
                <Route path="/employer/recommendations/:vacancyId" element={<EmployerCandidateRecommendationsPage />} />
                <Route path="/employer/inbox" element={<EmployerInboxPage />} />
                <Route path="/employer/inbox/:vacancyId" element={<EmployerInboxPage />} />
              </Route>
            </Route>
          </Routes>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
