import { LangGraphRunnableConfig } from "@langchain/langgraph";

import { calendarCommunityTool } from "./calendar-view-tool";
import { checkUsersCalendar } from "./check-user-calendar";
import { createUpsertMemoryTool } from "./upsert-memory";

/**
 * Initialize tools within a function so that they have access to the current
 * state and config at runtime.
 */
export function initializeTools(config?: LangGraphRunnableConfig) {
  const upsertMemoryTool = createUpsertMemoryTool(config);

  return [upsertMemoryTool, checkUsersCalendar, calendarCommunityTool];
}

export { checkUsersCalendar, calendarCommunityTool };
