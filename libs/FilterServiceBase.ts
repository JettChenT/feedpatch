import { generateObject } from "ai";
import { getModel, CHEAP_MODEL } from "./llm";
import * as z from "zod";

const filterSchema = z.object({
  reason: z.string().describe("Short explanation for the filter result"),
  passFilter: z
    .boolean()
    .describe("Whether the incoming text passes the criterias"),
});

export class FilterService {
  async filter(text: string, criterias: string[]) {
    const model = getModel(CHEAP_MODEL);
    const prompt = `Does the content "${text}" pass the following criterias: ${criterias.join(", ")}?`;
    const result = await generateObject({
      model,
      prompt,
      schema: filterSchema,
    });
    console.log(result.object);
    return result.object.passFilter;
  }
}
