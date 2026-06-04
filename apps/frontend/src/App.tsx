import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Header } from '@/components/Header'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { PipelinePage } from '@/pages/PipelinePage'
import { ReviewPage } from '@/pages/ReviewPage'
import { CompletePage } from '@/pages/CompletePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <Header />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/projects/new"
              element={
                <ProtectedRoute>
                  <NewProjectPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id/pipeline"
              element={
                <ProtectedRoute>
                  <PipelinePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id/review"
              element={
                <ProtectedRoute>
                  <ReviewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id/complete"
              element={
                <ProtectedRoute>
                  <CompletePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
