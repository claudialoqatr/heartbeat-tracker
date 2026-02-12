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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import DomainIcon from "@/components/DomainIcon";

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

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      // Delete heartbeats first (foreign key)
      const { error: hbError } = await supabase
        .from("heartbeats")
        .delete()
        .eq("document_id", docId);
      if (hbError) throw hbError;
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success("Document deleted");
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
                    {doc.domain} · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Select
                    onValueChange={(projectId) =>
                      assignMutation.mutate({ docId: doc.id, projectId })
                    }
                  >
                    <SelectTrigger className="w-48">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
