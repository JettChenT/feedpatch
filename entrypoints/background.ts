import { registerFilterService } from "@/libs/FilterService";
export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });
  registerFilterService();
});
