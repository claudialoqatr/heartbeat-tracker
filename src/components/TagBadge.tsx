import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";

type TagBadgeProps = {
  name: string;
  clockifyUrl?: string | null;
};

export default function TagBadge({ name, clockifyUrl }: TagBadgeProps) {
  const content = (
    <Badge variant="outline" className="gap-1 text-xs font-normal">
      <Tag className="h-3 w-3" />
      {name}
    </Badge>
  );

  if (clockifyUrl) {
    return (
      <a href={clockifyUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
        {content}
      </a>
    );
  }

  return content;
}
