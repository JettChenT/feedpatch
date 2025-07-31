import { defineProxyService } from "@webext-core/proxy-service";
import { FilterService } from "./FilterServiceBase";

export const [registerFilterService, getFilterService] = defineProxyService(
  "Filter",
  () => new FilterService(),
);
