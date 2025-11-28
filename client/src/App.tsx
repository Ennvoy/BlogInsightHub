import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/Layout";

import Dashboard from "@/pages/Dashboard";
import SearchPage from "@/pages/Search";
import ResultsPage from "@/pages/Results";
import ReviewPage from "@/pages/Review";
import CollaborationPage from "@/pages/Collaboration";
import ScheduleManager from "@/pages/ScheduleManager";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/search" component={SearchPage} />
        <Route path="/results" component={ResultsPage} />
        <Route path="/review" component={ReviewPage} />
        <Route path="/collaboration" component={CollaborationPage} />
        <Route path="/analytics" component={ScheduleManager} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;