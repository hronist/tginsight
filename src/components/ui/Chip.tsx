import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {children}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-4 rounded-full p-0 hover:bg-primary/15"
          aria-label="Удалить фильтр"
          onClick={onRemove}
        >
          <X className="size-3" />
        </Button>
      )}
    </Badge>
  );
}
