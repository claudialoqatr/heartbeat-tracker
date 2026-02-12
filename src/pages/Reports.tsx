import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfDay,
  endOfWeek,
  endOfMonth,
  format,
  subDays,
  subWeeks,
  subMonths,
} from "date-fns";

type Period = "daily" | "weekly" | "monthly";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function Reports() {
  const [period, setPeriod] = useState<Period>("daily");

  const range = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "daily":
        return { start: subDays(startOfDay(now), 6), end: endOfDay(now) };
      case "weekly":
        return { start: subWeeks(startOfWeek(now), 3), end: endOfWeek(now) };
      case "monthly":
        return { start: subMonths(startOfMonth(now), 5), end: endOfMonth(now) };
    }
  }, [period]);

  // Fetch project metadata for color/name lookup
  const { data: projects = [] } = useQuery({
    queryKey: ["all-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color");
      if (error) throw error;
      return data;
    },
  });

  const projectMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    projects.forEach((p) => map.set(p.id, { name: p.name, color: p.color }));
    return map;
  }, [projects]);

  const { data: analyticsRows = [] } = useQuery({
    queryKey: ["reports-analytics", range.start.toISOString()],
    queryFn: async () => {
      const startDate = format(range.start, "yyyy-MM-dd");
      const endDate = format(range.end, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("combined_analytics" as any)
        .select("user_id, document_id, project_id, domain, date, total_minutes")
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;
      return (data as unknown) as Array<{
        user_id: string;
        document_id: string;
        project_id: string | null;
        domain: string;
        date: string;
        total_minutes: number;
      }>;
    },
  });

  const { chartData, tableData, projectNames } = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {};
    const projectSet = new Set<string>();
    const projectTotals: Record<string, { minutes: number; color: string }> = {};

    analyticsRows.forEach((row) => {
      const d = new Date(row.date);
      let key: string;
      switch (period) {
        case "daily":
          key = format(d, "MMM dd");
          break;
        case "weekly":
          key = "W" + format(startOfWeek(d), "MMM dd");
          break;
        case "monthly":
          key = format(d, "MMM yyyy");
          break;
      }

      const proj = row.project_id ? projectMap.get(row.project_id) : null;
      const projName = proj?.name ?? "Unallocated";
      const projColor = proj?.color ?? "#94a3b8";
      projectSet.add(projName);

      if (!buckets[key]) buckets[key] = {};
      buckets[key][projName] = (buckets[key][projName] ?? 0) + row.total_minutes;

      if (!projectTotals[projName]) projectTotals[projName] = { minutes: 0, color: projColor };
      projectTotals[projName].minutes += row.total_minutes;
    });

    const projectNames = Array.from(projectSet);
    const chartData = Object.entries(buckets).map(([label, projects]) => ({
      label,
      ...projects,
    }));

    const totalMinutes = projectTotals
      ? Object.values(projectTotals).reduce((s, v) => s + v.minutes, 0)
      : 1;
    const tableData = Object.entries(projectTotals)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .map(([name, { minutes, color }]) => ({
        name,
        minutes,
        hours: (minutes / 60).toFixed(1),
        percent: Math.round((minutes / (totalMinutes || 1)) * 100),
        color,
      }));

    return { chartData, tableData, projectNames };
  }, [analyticsRows, period, projectMap]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Time by Project</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No data for this period
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} label={{ value: "min", angle: -90, position: "insideLeft" }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Legend />
                {projectNames.map((name, i) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={COLORS[i % COLORS.length]}
                    radius={i === projectNames.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {tableData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No data</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Minutes</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.minutes}</TableCell>
                    <TableCell className="text-right">{row.hours}</TableCell>
                    <TableCell className="text-right">{row.percent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
