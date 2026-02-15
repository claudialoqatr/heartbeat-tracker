import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tag } from "lucide-react";

type TagSelectProps = {
  projectId: string | null;
  value: string | null;
  onValueChange: (tagId: string | null) => void;
  disabled?: boolean;
};

export default function TagSelect({ projectId, value, onValueChange, disabled }: TagSelectProps) {
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

  const isDisabled = disabled || !projectId || tags.length === 0;

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onValueChange(v === "none" ? null : v)}
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
      </SelectContent>
    </Select>
  );
}
