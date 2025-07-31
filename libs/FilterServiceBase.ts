import { generateObject, type ModelMessage } from "ai";
import { getModel, CHEAP_MODEL } from "./llm";
import * as z from "zod";

const filterSchema = z.object({
  reason: z.string().describe("Short explanation for the filter result"),
  passFilter: z
    .boolean()
    .describe("Whether the incoming text passes the criterias"),
});

export class FilterService {
  async filter(content: ModelMessage[], criterias: string[]) {
    const model = getModel(CHEAP_MODEL);
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          "You will determine whether the provided content fits first the provided criterias.",
      },
      {
        role: "system",
        content: `<criterias>\n ${criterias.join(", ")} \n</criterias>`,
      },
      {
        role: "user",
        content: "<content>",
      },
      ...content,
      {
        role: "user",
        content: "</content>",
      },
    ];
    const result = await generateObject({
      model,
      messages,
      schema: filterSchema,
    });
    console.log(result.object);
    return result.object.passFilter;
  }
}
