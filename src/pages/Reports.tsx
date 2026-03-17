import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { CalendarIcon, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import TagBadge from "@/components/TagBadge";
import type { DateRange } from "react-day-picker";

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const toggleProject = (name: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const range = useMemo(() => {
    if (dateRange?.from) {
      return {
        start: startOfDay(dateRange.from),
        end: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from),
      };
    }
    const now = new Date();
    switch (period) {
      case "daily":
        return { start: subDays(startOfDay(now), 6), end: endOfDay(now) };
      case "weekly":
        return { start: subWeeks(startOfWeek(now), 3), end: endOfWeek(now) };
      case "monthly":
        return { start: subMonths(startOfMonth(now), 5), end: endOfMonth(now) };
    }
  }, [period, dateRange]);

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

  // Fetch documents for title/tag info
  const docIds = useMemo(
    () => [...new Set(analyticsRows.map((r) => r.document_id))],
    [analyticsRows]
  );

  const { data: documents = [] } = useQuery({
    queryKey: ["reports-documents", docIds],
    enabled: docIds.length > 0,
    queryFn: async () => {
      // Supabase has a 1000 row limit, batch if needed
      const results: Array<{ id: string; title: string | null; tag_id: string | null; domain: string }> = [];
      for (let i = 0; i < docIds.length; i += 500) {
        const batch = docIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from("documents")
          .select("id, title, tag_id, domain")
          .in("id", batch);
        if (error) throw error;
        results.push(...(data ?? []));
      }
      return results;
    },
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["reports-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, clockify_url");
      if (error) throw error;
      return data;
    },
  });

  const docMap = useMemo(() => {
    const map = new Map<string, { title: string | null; tag_id: string | null; domain: string }>();
    documents.forEach((d) => map.set(d.id, { title: d.title, tag_id: d.tag_id, domain: d.domain }));
    return map;
  }, [documents]);

  const tagMap = useMemo(() => {
    const map = new Map<string, { name: string; clockify_url: string | null }>();
    tags.forEach((t) => map.set(t.id, { name: t.name, clockify_url: t.clockify_url }));
    return map;
  }, [tags]);

  const { chartData, tableData, projectNames } = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {};
    const projectSet = new Set<string>();
    const projectTotals: Record<string, { minutes: number; color: string; projectId: string | null }> = {};
    // Per-project, per-document breakdown
    const projectDocs: Record<string, Record<string, number>> = {};

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

      if (!projectTotals[projName])
        projectTotals[projName] = { minutes: 0, color: projColor, projectId: row.project_id };
      projectTotals[projName].minutes += row.total_minutes;

      if (!projectDocs[projName]) projectDocs[projName] = {};
      projectDocs[projName][row.document_id] =
        (projectDocs[projName][row.document_id] ?? 0) + row.total_minutes;
    });

    const projectNames = Array.from(projectSet);
    const chartData = Object.entries(buckets).map(([label, projects]) => ({
      label,
      ...projects,
    }));

    const totalMinutes = Object.values(projectTotals).reduce((s, v) => s + v.minutes, 0) || 1;
    const tableData = Object.entries(projectTotals)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .map(([name, { minutes, color }]) => ({
        name,
        minutes,
        hours: (minutes / 60).toFixed(1),
        percent: Math.round((minutes / totalMinutes) * 100),
        color,
        docs: Object.entries(projectDocs[name] || {})
          .map(([docId, mins]) => {
            const doc = docMap.get(docId);
            const tag = doc?.tag_id ? tagMap.get(doc.tag_id) : null;
            return {
              docId,
              title: doc?.title || doc?.domain || docId,
              tag: tag ?? null,
              minutes: mins,
              hours: (mins / 60).toFixed(1),
            };
          })
          .sort((a, b) => b.minutes - a.minutes),
      }));

    return { chartData, tableData, projectNames };
  }, [analyticsRows, period, projectMap, docMap, tagMap]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "justify-start text-left font-normal",
                  !dateRange?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-4 w-4 mr-1.5" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM dd")} – {format(dateRange.to, "MMM dd, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM dd, yyyy")
                  )
                ) : (
                  "Custom range"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {dateRange?.from && (
            <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
              Clear
            </Button>
          )}
          <Tabs value={period} onValueChange={(v) => { setPeriod(v as Period); setDateRange(undefined); }}>
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
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
                {tableData.map((row) => {
                  const isExpanded = expandedProjects.has(row.name);
                  return (
                    <>
                      <TableRow
                        key={row.name}
                        className="cursor-pointer"
                        onClick={() => toggleProject(row.name)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: row.color }}
                            />
                            {row.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{row.minutes}</TableCell>
                        <TableCell className="text-right">{row.hours}</TableCell>
                        <TableCell className="text-right">{row.percent}%</TableCell>
                      </TableRow>
                      {isExpanded &&
                        row.docs.map((doc) => (
                          <TableRow key={doc.docId} className="bg-muted/30">
                            <TableCell className="pl-12">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm">{doc.title}</span>
                                {doc.tag && (
                                  <TagBadge
                                    name={doc.tag.name}
                                    clockifyUrl={doc.tag.clockify_url}
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm">{doc.minutes}</TableCell>
                            <TableCell className="text-right text-sm">{doc.hours}</TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
