/** Browser print → Save as PDF for fleet asset / custom reports. */
export function printFleetReport(): void {
  if (typeof window === "undefined") return;
  window.print();
}
