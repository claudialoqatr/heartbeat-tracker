import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Unallocated() {
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["unallocated-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .is("project_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ docId, projectId }: { docId: string; projectId: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ project_id: projectId })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success("Document assigned");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Unallocated Work</h1>
        <Badge variant="secondary">{docs.length} docs</Badge>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            🎉 All documents are assigned to projects!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {doc.title || doc.doc_identifier}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {doc.domain} · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Select
                  onValueChange={(projectId) =>
                    assignMutation.mutate({ docId: doc.id, projectId })
                  }
                >
                  <SelectTrigger className="w-48 ml-4">
                    <SelectValue placeholder="Assign project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
