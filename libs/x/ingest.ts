import type { TimelineItem, TimelineResponse, TimelineModule } from "./types";

export type TimelineEntry = TimelineItem | TimelineModule;

export function handleXResponseData(url: string, data: string) {
  if (
    url.startsWith("https://x.com/i/api/graphql") &&
    url.includes("HomeTimeline")
  ) {
    return handleTimelineData(JSON.parse(data) as TimelineResponse);
  }
}

function handleTimelineData(data: TimelineResponse) {
  console.log("handling X/Twitter timeline data", data);
  const instructions = data.data.home.home_timeline_urt.instructions;
  let entries: TimelineEntry[] = [];
  instructions.map((instruction) => {
    if (instruction.type !== "TimelineAddEntries") {
      return;
    }
    const cur_entries = instruction.entries.filter(
      (entry): entry is TimelineEntry =>
        entry.content.__typename === "TimelineTimelineItem" ||
        entry.content.__typename === "TimelineTimelineModule",
    );
    entries = entries.concat(cur_entries);
  });
  return entries;
}
