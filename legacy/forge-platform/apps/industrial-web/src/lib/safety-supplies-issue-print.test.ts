import { describe, expect, it } from "vitest";
import { buildSupplyIssueAcknowledgmentHtml } from "./safety-supplies-issue-print";

describe("safety-supplies-issue-print", () => {
  it("builds an acknowledgment with items and blank signature lines when unsigned", () => {
    const html = buildSupplyIssueAcknowledgmentHtml({
      tenantName: "Producers Rice Mill",
      recipientName: "Jane Doe",
      recipientId: "EMP-1",
      facilityName: "Stuttgart AR",
      divisionName: "Milling",
      departmentName: "Operations",
      lines: [
        {
          itemNumber: "SSI-1",
          itemName: "Safety Glasses",
          quantity: 2,
          unitOfMeasure: "EA",
          locationName: "Main Supply Room",
        },
        {
          itemNumber: "SSI-2",
          itemName: "Gloves",
          quantity: "1.5",
          unitOfMeasure: "PR",
          locationName: "Main Supply Room",
        },
      ],
    });

    expect(html).toContain("Safety Supplies Issue Acknowledgment");
    expect(html).toContain("Producers Rice Mill");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Safety Glasses");
    expect(html).toContain("Gloves");
    expect(html).toContain("Recipient signature");
    expect(html).toContain("Recipient printed name");
    expect(html).toContain("I acknowledge receipt");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('class="sig-image"');
  });

  it("embeds a digital signature image and printed name when provided", () => {
    const sig =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
    const html = buildSupplyIssueAcknowledgmentHtml({
      recipientName: "Alex Receiver",
      recipientSignatureDataUrl: sig,
      recipientSignedAt: "2026-09-09T17:00:00.000Z",
      lines: [{ itemName: "Hard Hat", quantity: 1, unitOfMeasure: "EA" }],
    });

    expect(html).toContain('class="sig-image"');
    expect(html).toContain(sig);
    expect(html).toContain("Alex Receiver");
    expect(html).toContain("Date signed");
  });

  it("rejects unsafe signature URLs in print HTML", () => {
    const html = buildSupplyIssueAcknowledgmentHtml({
      recipientName: "Alex",
      recipientSignatureDataUrl: "javascript:alert(1)",
      lines: [{ itemName: "Hard Hat", quantity: 1 }],
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('class="sig-image"');
  });
});
