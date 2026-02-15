import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, Plus } from "lucide-react";
import { toast } from "sonner";

type TagSelectProps = {
  projectId: string | null;
  value: string | null;
  onValueChange: (tagId: string | null) => void;
  disabled?: boolean;
};

export default function TagSelect({ projectId, value, onValueChange, disabled }: TagSelectProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, clockify_url")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("tags").insert({
        name: name.trim(),
        project_id: projectId!,
        user_id: user.id,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["tags", projectId] });
      onValueChange(newId);
      setAdding(false);
      setNewName("");
      toast.success("Tag created");
    },
  });

  const isDisabled = disabled || !projectId;

  if (adding) {
    return (
      <div className="flex items-center gap-1 w-40">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tag name"
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName);
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!newName.trim()} onClick={() => createMutation.mutate(newName)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => {
        if (v === "__add__") { setAdding(true); return; }
        onValueChange(v === "none" ? null : v);
      }}
      disabled={isDisabled}
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder={!projectId ? "Assign project first" : "No tag"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">No tag</span>
        </SelectItem>
        {tags.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <div className="flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              {t.name}
            </div>
          </SelectItem>
        ))}
        <SelectItem value="__add__">
          <div className="flex items-center gap-1.5 text-primary">
            <Plus className="h-3 w-3" />
            Add Tag
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
