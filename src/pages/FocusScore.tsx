import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function FocusScore() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: heartbeats = [] } = useQuery({
    queryKey: ["focus-heartbeats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heartbeats")
        .select("recorded_at, document_id")
        .gte("recorded_at", today.toISOString())
        .order("recorded_at");
      if (error) throw error;
      return data;
    },
  });

  const hourlyData = useMemo(() => {
    const hours: Record<number, { count: number; docs: Set<string> }> = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { count: 0, docs: new Set() };
    }
    heartbeats.forEach((hb) => {
      const hour = new Date(hb.recorded_at).getHours();
      hours[hour].count++;
      hours[hour].docs.add(hb.document_id);
    });
    return Array.from({ length: 24 }, (_, h) => {
      const { count, docs } = hours[h];
      const density = Math.round((count / 60) * 100);
      const fragmentation = docs.size;
      return {
        hour: `${h.toString().padStart(2, "0")}:00`,
        heartbeats: count,
        density,
        documents: fragmentation,
      };
    });
  }, [heartbeats]);

  const totalMinutes = heartbeats.length;
  const avgDensity =
    hourlyData.filter((h) => h.heartbeats > 0).length > 0
      ? Math.round(
          hourlyData
            .filter((h) => h.heartbeats > 0)
            .reduce((sum, h) => sum + h.density, 0) /
            hourlyData.filter((h) => h.heartbeats > 0).length
        )
      : 0;

  const bestHour = hourlyData.reduce(
    (best, h) => (h.heartbeats > best.heartbeats ? h : best),
    hourlyData[0]
  );

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Focus Score</h1>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Active Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMinutes} min</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Focus Density
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDensity}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Best Focus Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestHour.hour}</div>
            <p className="text-xs text-muted-foreground">
              {bestHour.heartbeats} heartbeats
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hourly Activity — Today</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11 }}
                interval={2}
                className="fill-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Bar
                dataKey="heartbeats"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                name="Heartbeats"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
