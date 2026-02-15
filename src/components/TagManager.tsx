import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Tag, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type TagManagerProps = {
  projectId: string;
};

export default function TagManager({ projectId }: TagManagerProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [clockifyUrl, setClockifyUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("tags").insert({
        name: name.trim(),
        project_id: projectId,
        user_id: user.id,
        clockify_url: clockifyUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags", projectId] });
      setName("");
      setClockifyUrl("");
      setAdding(false);
      toast.success("Tag created");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      // Clear tag_id on documents first
      await supabase.from("documents").update({ tag_id: null }).eq("tag_id", tagId);
      const { error } = await supabase.from("tags").delete().eq("id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags", projectId] });
      toast.success("Tag deleted");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4" /> Clockify Tags
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Tag
        </Button>
      </div>

      {adding && (
        <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/30">
          <div>
            <Label>Tag Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Review" />
          </div>
          <div>
            <Label>Clockify URL (optional)</Label>
            <Input value={clockifyUrl} onChange={(e) => setClockifyUrl(e.target.value)} placeholder="https://app.clockify.me/..." />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" disabled={!name.trim()} onClick={() => createMutation.mutate()}>Create</Button>
          </div>
        </div>
      )}

      {tags.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">No tags yet. Add one to track sub-tasks.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1.5 py-1 px-2.5">
              <Tag className="h-3 w-3" />
              {t.name}
              {t.clockify_url && (
                <a href={t.clockify_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </a>
              )}
              <Trash2
                className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-destructive ml-1"
                onClick={() => deleteMutation.mutate(t.id)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
