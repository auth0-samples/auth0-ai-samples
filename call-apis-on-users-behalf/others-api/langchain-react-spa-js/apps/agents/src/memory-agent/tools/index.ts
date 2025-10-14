import { LangGraphRunnableConfig } from "@langchain/langgraph";

import { checkUsersCalendar } from "./check-user-calendar";
import { createUpsertMemoryTool } from "./upsert-memory";
import { viewCalendarEvents } from "./view-calendar-events";

/**
 * Initialize tools within a function so that they have access to the current
 * state and config at runtime.
 */
export function initializeTools(config?: LangGraphRunnableConfig) {
  const upsertMemoryTool = createUpsertMemoryTool(config);

  return [upsertMemoryTool, checkUsersCalendar, viewCalendarEvents];
}

export { checkUsersCalendar, viewCalendarEvents };
