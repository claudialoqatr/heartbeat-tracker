import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppSidebar from "./AppSidebar";
import { Loader2 } from "lucide-react";

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 min-w-0 ml-64 p-4 md:p-8 overflow-x-hidden">
        <div className="w-full max-w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
