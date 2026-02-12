import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { ArrowLeft, CalendarIcon, Clock, FileText, Globe } from "lucide-react";
import DomainIcon from "@/components/DomainIcon";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["project-docs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("project_id", id!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const docIds = documents.map((d) => d.id);

  const { data: analyticsRows = [] } = useQuery({
    queryKey: ["project-analytics", id, dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      if (docIds.length === 0) return [];
      const startDate = format(startOfDay(dateRange.from), "yyyy-MM-dd");
      const endDate = format(endOfDay(dateRange.to), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("combined_analytics" as any)
        .select("user_id, document_id, project_id, domain, date, total_minutes")
        .in("document_id", docIds)
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
    enabled: docIds.length > 0,
  });

  const stats = useMemo(() => {
    let totalMinutes = 0;
    const byDoc = new Map<string, number>();
    for (const row of analyticsRows) {
      totalMinutes += row.total_minutes;
      byDoc.set(row.document_id, (byDoc.get(row.document_id) || 0) + row.total_minutes);
    }
    return { totalMinutes, byDoc };
  }, [analyticsRows]);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  if (!project) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div
          className="h-4 w-4 rounded-full shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <div className="flex gap-1 ml-2">
          {(project.keywords ?? []).map((k: string) => (
            <Badge key={k} variant="outline" className="text-xs">
              {k}
            </Badge>
          ))}
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-2 mb-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from) {
                  setDateRange({ from: range.from, to: range.to ?? range.from });
                }
              }}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <div className="flex gap-1">
          {[
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ].map(({ label, days }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              onClick={() =>
                setDateRange({ from: subDays(new Date(), days), to: new Date() })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Time</p>
                <p className="text-2xl font-bold">{formatTime(stats.totalMinutes)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Documents</p>
                <p className="text-2xl font-bold">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Domains</p>
                <p className="text-2xl font-bold">
                  {new Set(documents.map((d) => d.domain)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document list with time */}
      <h2 className="text-lg font-semibold mb-3">Documents</h2>
      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No documents assigned to this project yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents
            .sort((a, b) => (stats.byDoc.get(b.id) || 0) - (stats.byDoc.get(a.id) || 0))
            .map((doc) => {
              const mins = stats.byDoc.get(doc.id) || 0;
              const pct =
                stats.totalMinutes > 0
                  ? Math.round((mins / stats.totalMinutes) * 100)
                  : 0;
              return (
                <Card key={doc.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="min-w-0 flex-1">
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-medium truncate hover:underline text-primary">
                          {doc.title || doc.doc_identifier}
                        </a>
                      ) : (
                        <p className="font-medium truncate">
                          {doc.title || doc.doc_identifier}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <DomainIcon domain={doc.domain} size={14} />
                        {doc.domain} · Last active{" "}
                        {format(new Date(doc.updated_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 ml-4 shrink-0">
                      <div className="text-right">
                        <p className="font-semibold">{formatTime(mins)}</p>
                        <p className="text-xs text-muted-foreground">{pct}%</p>
                      </div>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
