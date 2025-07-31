import { FilterService } from "@/libs/FilterServiceBase";

const sampleTxt = "oh my god! this thing just happened!";
const criterias = ["not sensational / engagement bait"];

const filterService = new FilterService();
const res = await filterService.filter(sampleTxt, criterias);

console.log(res);
