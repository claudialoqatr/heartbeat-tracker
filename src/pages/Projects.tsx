import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  created_at: string;
};

function ProjectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Project;
  onSave: (data: { name: string; color: string; keywords: string[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366f1");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [kw, setKw] = useState("");

  const addKeyword = () => {
    const trimmed = kw.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
    }
    setKw("");
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project Haven" />
      </div>
      <div>
        <Label>Color</Label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded border border-input cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">{color}</span>
        </div>
      </div>
      <div>
        <Label>Auto-tag Keywords</Label>
        <div className="flex gap-2">
          <Input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="e.g. haven"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addKeyword}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {keywords.map((k) => (
            <Badge key={k} variant="secondary" className="gap-1">
              {k}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setKeywords(keywords.filter((x) => x !== k))}
              />
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => name.trim() && onSave({ name: name.trim(), color, keywords })}>
          {initial ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

export default function Projects() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (p: { name: string; color: string; keywords: string[] }) => {
      const { error } = await supabase.from("projects").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setCreating(false);
      toast.success("Project created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string; name: string; color: string; keywords: string[] }) => {
      const { error } = await supabase.from("projects").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setEditing(null);
      toast.success("Project updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <ProjectForm
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setCreating(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No projects yet. Create your first one!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteMutation.mutate(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {p.keywords.length > 0 ? (
                    p.keywords.map((k) => (
                      <Badge key={k} variant="outline" className="text-xs">
                        {k}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No keywords</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProjectForm
              initial={editing}
              onSave={(data) => updateMutation.mutate({ id: editing.id, ...data })}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
