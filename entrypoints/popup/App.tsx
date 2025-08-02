import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRules, useAddRule, useUpdateRule, useDeleteRule } from "@/libs/query";
import type { Rule } from "@/libs/storage";
import { Plus, Trash2, Edit2, X, Check } from "lucide-react";

function App() {
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<{ criteria: string; mode: "block" | "allow" }>({ criteria: "", mode: "block" });
  const [editRule, setEditRule] = useState<{ criteria: string; mode: "block" | "allow" }>({ criteria: "", mode: "block" });

  const { data: rules = [], isLoading, error } = useRules();
  const addRuleMutation = useAddRule();
  const updateRuleMutation = useUpdateRule();
  const deleteRuleMutation = useDeleteRule();

  const handleAddRule = async () => {
    if (newRule.criteria.trim()) {
      await addRuleMutation.mutateAsync(newRule);
      setNewRule({ criteria: "", mode: "block" });
      setIsAddingRule(false);
    }
  };

  const handleUpdateRule = async (id: string) => {
    if (editRule.criteria.trim()) {
      await updateRuleMutation.mutateAsync({ id, updates: editRule });
      setEditingRule(null);
      setEditRule({ criteria: "", mode: "block" });
    }
  };

  const handleDeleteRule = async (id: string) => {
    await deleteRuleMutation.mutateAsync(id);
  };

  const startEditing = (rule: Rule) => {
    setEditingRule(rule.id);
    setEditRule({ criteria: rule.criteria, mode: rule.mode });
  };

  const cancelEditing = () => {
    setEditingRule(null);
    setEditRule({ criteria: "", mode: "block" });
  };

  const cancelAdding = () => {
    setIsAddingRule(false);
    setNewRule({ criteria: "", mode: "block" });
  };

  if (isLoading) {
    return (
      <div className="w-[400px] h-[600px] p-4 flex items-center justify-center">
        <p className="text-gray-500">Loading rules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[400px] h-[600px] p-4 flex items-center justify-center">
        <p className="text-red-500">Error loading rules, {error.message}</p>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[600px] p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Filter Rules</h1>
        <Button
          onClick={() => setIsAddingRule(true)}
          size="sm"
          disabled={isAddingRule}
          className="flex items-center gap-2"
        >
          <Plus size={16} />
          Add Rule
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Add new rule form */}
        {isAddingRule && (
          <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
            <div className="space-y-3">
              <div>
                <label htmlFor="new-criteria" className="block text-sm font-medium mb-1">Criteria</label>
                <textarea
                  id="new-criteria"
                  value={newRule.criteria}
                  onChange={(e) => setNewRule({ ...newRule, criteria: e.target.value })}
                  placeholder="Enter filtering criteria..."
                  className="w-full px-3 py-2 border rounded-md resize-none h-20 text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-mode" className="block text-sm font-medium mb-1">Mode</label>
                <select
                  id="new-mode"
                  value={newRule.mode}
                  onChange={(e) => setNewRule({ ...newRule, mode: e.target.value as "block" | "allow" })}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="block">Block</option>
                  <option value="allow">Allow</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddRule}
                  size="sm"
                  disabled={!newRule.criteria.trim() || addRuleMutation.isPending}
                  className="flex items-center gap-1"
                >
                  <Check size={14} />
                  Save
                </Button>
                <Button
                  onClick={cancelAdding}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <X size={14} />
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Rules list */}
        {rules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No rules configured</p>
            <p className="text-sm">Add your first rule to get started</p>
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="border rounded-lg p-3 bg-white dark:bg-gray-900">
              {editingRule === rule.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`edit-criteria-${rule.id}`} className="block text-sm font-medium mb-1">Criteria</label>
                    <textarea
                      id={`edit-criteria-${rule.id}`}
                      value={editRule.criteria}
                      onChange={(e) => setEditRule({ ...editRule, criteria: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md resize-none h-20 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-mode-${rule.id}`} className="block text-sm font-medium mb-1">Mode</label>
                    <select
                      id={`edit-mode-${rule.id}`}
                      value={editRule.mode}
                      onChange={(e) => setEditRule({ ...editRule, mode: e.target.value as "block" | "allow" })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="block">Block</option>
                      <option value="allow">Allow</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleUpdateRule(rule.id)}
                      size="sm"
                      disabled={!editRule.criteria.trim() || updateRuleMutation.isPending}
                      className="flex items-center gap-1"
                    >
                      <Check size={14} />
                      Save
                    </Button>
                    <Button
                      onClick={cancelEditing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <X size={14} />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {rule.criteria}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        onClick={() => startEditing(rule)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        onClick={() => handleDeleteRule(rule.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        disabled={deleteRuleMutation.isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        rule.mode === "block"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {rule.mode === "block" ? "🚫 Block" : "✅ Allow"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="border-t pt-3 mt-4">
        <p className="text-xs text-gray-500 text-center">
          {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
        </p>
      </div>
    </div>
  );
}

export default App;
