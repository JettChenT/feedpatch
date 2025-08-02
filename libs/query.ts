import { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { storageRuleItems, storageDebugConfig, type Rule } from "./storage";

export const queryClient = new QueryClient();

// Query keys
export const QUERY_KEYS = {
	rules: ["rules"] as const,
	debug: ["debug"] as const,
};

// Custom hooks for rules management
export function useRules() {
	return useQuery({
		queryKey: QUERY_KEYS.rules,
		queryFn: async () => {
			const rules = await storageRuleItems.getValue();
			return rules;
		},
	});
}

export function useAddRule() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (newRule: Omit<Rule, "id">) => {
			const currentRules = await storageRuleItems.getValue();
			const rule: Rule = {
				...newRule,
				id: nanoid(),
			};
			const updatedRules = [...currentRules, rule];
			await storageRuleItems.setValue(updatedRules);
			return rule;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rules });
		},
	});
}

export function useUpdateRule() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			updates,
		}: {
			id: string;
			updates: Partial<Rule>;
		}) => {
			const currentRules = await storageRuleItems.getValue();
			const updatedRules = currentRules.map((rule) =>
				rule.id === id ? { ...rule, ...updates } : rule,
			);
			await storageRuleItems.setValue(updatedRules);
			return updatedRules.find((rule) => rule.id === id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rules });
		},
	});
}

export function useDeleteRule() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			const currentRules = await storageRuleItems.getValue();
			const updatedRules = currentRules.filter((rule) => rule.id !== id);
			await storageRuleItems.setValue(updatedRules);
			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rules });
		},
	});
}

// Custom hooks for debug configuration management
export function useDebugConfig() {
	return useQuery({
		queryKey: QUERY_KEYS.debug,
		queryFn: async () => {
			const isDebug = await storageDebugConfig.getValue();
			return isDebug;
		},
	});
}

export function useToggleDebug() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (isDebug: boolean) => {
			await storageDebugConfig.setValue(isDebug);
			return isDebug;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEYS.debug });
		},
	});
}
