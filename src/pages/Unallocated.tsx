import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Trash2, CheckSquare, Wand2, Search, X } from "lucide-react";
import { toast } from "sonner";
import DomainIcon from "@/components/DomainIcon";
import TagSelect from "@/components/TagSelect";
import TagBadge from "@/components/TagBadge";

export default function Unallocated() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");

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
        .select("id, name, color, keywords")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["all-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, clockify_url, project_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const domains = useMemo(() => {
    const set = new Set(docs.map((d) => d.domain));
    return Array.from(set).sort();
  }, [docs]);

  const filteredDocs = useMemo(() => {
    let result = docs;
    if (domainFilter !== "all") {
      result = result.filter((d) => d.domain === domainFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          (d.title || "").toLowerCase().includes(q) ||
          (d.doc_identifier || "").toLowerCase().includes(q) ||
          (d.domain || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [docs, search, domainFilter]);

  const assignMutation = useMutation({
    mutationFn: async ({ docId, projectId }: { docId: string; projectId: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ project_id: projectId, tag_id: null })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success("Document assigned");
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ docId, tagId }: { docId: string; tagId: string | null }) => {
      const { error } = await supabase
        .from("documents")
        .update({ tag_id: tagId })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      toast.success("Tag updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error: hbError } = await supabase
        .from("heartbeats")
        .delete()
        .in("document_id", ids);
      if (hbError) throw hbError;
      const { error } = await supabase
        .from("documents")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success("Documents deleted");
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, projectId }: { ids: string[]; projectId: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ project_id: projectId, tag_id: null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success("Documents assigned");
    },
  });

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      let assigned = 0;
      for (const doc of docs) {
        const title = (doc.title || doc.doc_identifier || "").toLowerCase();
        const domain = (doc.domain || "").toLowerCase();
        const matchedProject = projects.find((p) =>
          p.keywords?.some((kw: string) => {
            const lkw = kw.toLowerCase();
            return title.includes(lkw) || domain.includes(lkw);
          })
        );
        if (matchedProject) {
          const { error } = await supabase
            .from("documents")
            .update({ project_id: matchedProject.id, tag_id: null })
            .eq("id", doc.id);
          if (error) throw error;
          assigned++;
        }
      }
      return assigned;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["unallocated-docs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-unallocated"] });
      toast.success(`Auto-assigned ${count} document${count !== 1 ? "s" : ""}`);
    },
    onError: () => toast.error("Auto-assign failed"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = docs.length > 0 && selected.size === docs.length;
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(docs.map((d) => d.id)));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Unallocated Work</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoAssignMutation.mutate()}
            disabled={autoAssignMutation.isPending || docs.length === 0}
          >
            <Wand2 className="h-4 w-4 mr-1.5" />
            {autoAssignMutation.isPending ? "Scanning…" : "Auto-assign"}
          </Button>
          <Badge variant="secondary">{filteredDocs.length} / {docs.length} docs</Badge>
        </div>
      </div>

      {/* Search & filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="All domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>
                <div className="flex items-center gap-2">
                  <DomainIcon domain={d} size={14} />
                  {d}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border bg-muted/40">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              onValueChange={(projectId) =>
                bulkAssignMutation.mutate({ ids: Array.from(selected), projectId })
              }
            >
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="Assign to project…" />
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
              variant="destructive"
              size="sm"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete {selected.size}
            </Button>
          </div>
        </div>
      )}

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
          {/* Select all row */}
          <div className="flex items-center gap-2 px-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>

          {docs.map((doc) => {
            const docTag = doc.tag_id ? allTags.find((t) => t.id === doc.tag_id) : null;
            const isSelected = selected.has(doc.id);
            return (
            <Card key={doc.id} className={isSelected ? "ring-2 ring-primary" : ""}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(doc.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-medium truncate hover:underline text-primary">
                          {doc.title || doc.doc_identifier}
                        </a>
                      ) : (
                        <p className="font-medium truncate">
                          {doc.title || doc.doc_identifier}
                        </p>
                      )}
                      {docTag && <TagBadge name={docTag.name} clockifyUrl={docTag.clockify_url} />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <DomainIcon domain={doc.domain} size={14} />
                      {doc.domain} · {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
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
                  <TagSelect
                    projectId={doc.project_id}
                    value={doc.tag_id}
                    onValueChange={(tagId) => updateTagMutation.mutate({ docId: doc.id, tagId })}
                  />
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
            );
          })}
        </div>
      )}
    </div>
  );
}
