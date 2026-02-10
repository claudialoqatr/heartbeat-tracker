import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, FolderKanban, AlertCircle } from "lucide-react";

export default function Index() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayHeartbeats } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: async () => {
      const { count } = await supabase
        .from("heartbeats")
        .select("*", { count: "exact", head: true })
        .gte("recorded_at", today.toISOString());
      return count ?? 0;
    },
  });

  const { data: projectCount } = useQuery({
    queryKey: ["dashboard-projects"],
    queryFn: async () => {
      const { count } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: unallocatedCount } = useQuery({
    queryKey: ["dashboard-unallocated"],
    queryFn: async () => {
      const { count } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .is("project_id", null);
      return count ?? 0;
    },
  });

  const stats = [
    {
      label: "Active Today",
      value: `${todayHeartbeats ?? 0} min`,
      icon: Clock,
      color: "text-primary",
    },
    {
      label: "Projects",
      value: projectCount ?? 0,
      icon: FolderKanban,
      color: "text-accent",
    },
    {
      label: "Unallocated Docs",
      value: unallocatedCount ?? 0,
      icon: AlertCircle,
      color: "text-destructive",
    },
    {
      label: "Heartbeats Today",
      value: todayHeartbeats ?? 0,
      icon: Activity,
      color: "text-primary",
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
