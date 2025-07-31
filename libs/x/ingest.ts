import type { TimelineItem, TimelineResponse } from "./types";

export function handleXResponseData(url: string, data: string) {
  if (
    url.startsWith("https://x.com/i/api/graphql") &&
    url.includes("HomeTimeline")
  ) {
    return handleTimelineData(JSON.parse(data) as TimelineResponse);
  }
}

function handleTimelineData(data: TimelineResponse) {
  console.debug("handling X/Twitter timeline data", data);
  const instructions = data.data.home.home_timeline_urt.instructions;
  let entries: TimelineItem[] = [];
  instructions.map((instruction) => {
    if (instruction.type !== "TimelineAddEntries") {
      return;
    }
    const cur_entries = instruction.entries.filter(
      (entry): entry is TimelineItem =>
        entry.content.__typename === "TimelineTimelineItem",
    );
    entries = entries.concat(cur_entries);
  });
  return entries;
}
