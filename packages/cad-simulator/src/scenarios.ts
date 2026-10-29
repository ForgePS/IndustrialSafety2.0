export type CadSimulatorScenarioId =
  | "new-incident"
  | "update-incident"
  | "unit-dispatched"
  | "comment-added"
  | "heartbeat"
  | "connection-test";

export type CadSimulatorScenario = {
  id: CadSimulatorScenarioId;
  name: string;
  description: string;
  eventType: string;
  defaultTransport: "HTTPS_WEBHOOK" | "SYNTHETIC_SIMULATOR" | "POLLING";
};

export const CAD_SIMULATOR_SCENARIOS: CadSimulatorScenario[] = [
  {
    id: "new-incident",
    name: "New incident",
    description: "Creates a synthetic CAD incident shell with address and call type.",
    eventType: "INCIDENT_CREATED",
    defaultTransport: "HTTPS_WEBHOOK",
  },
  {
    id: "update-incident",
    name: "Update incident",
    description: "Updates an existing synthetic CAD incident (sequence +1).",
    eventType: "INCIDENT_UPDATED",
    defaultTransport: "HTTPS_WEBHOOK",
  },
  {
    id: "unit-dispatched",
    name: "Unit dispatched",
    description: "Adds a dispatched unit to a synthetic incident.",
    eventType: "UNIT_DISPATCHED",
    defaultTransport: "HTTPS_WEBHOOK",
  },
  {
    id: "comment-added",
    name: "Comment added",
    description: "Adds an operational CAD comment.",
    eventType: "COMMENT_ADDED",
    defaultTransport: "HTTPS_WEBHOOK",
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    description: "Health heartbeat with no incident mutation.",
    eventType: "HEARTBEAT",
    defaultTransport: "POLLING",
  },
  {
    id: "connection-test",
    name: "Connection test",
    description: "Adapter connection test event.",
    eventType: "CONNECTION_TEST",
    defaultTransport: "SYNTHETIC_SIMULATOR",
  },
];

export function listCadSimulatorScenarios(): CadSimulatorScenario[] {
  return [...CAD_SIMULATOR_SCENARIOS];
}

export function getCadSimulatorScenario(id: string): CadSimulatorScenario | undefined {
  return CAD_SIMULATOR_SCENARIOS.find((row) => row.id === id);
}
