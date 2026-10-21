import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractPptxSlideAudio, __pptxAudioTestUtils } from "./pptx-slide-audio";

const {
  mimeForMediaPath,
  resolveZipPath,
  parseRelationships,
  slideLooksLikeItHasAudio,
  isAudioRelationship,
  isBrowserPlayableMime,
} = __pptxAudioTestUtils;

async function buildSamplePptx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
       <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
       <Default Extension="xml" ContentType="application/xml"/>
       <Default Extension="mp3" ContentType="audio/mpeg"/>
       <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
       <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
     </Types>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
       <p:sldIdLst>
         <p:sldId id="256" r:id="rId2"/>
       </p:sldIdLst>
     </p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
     </Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
       <p:timing>
         <p:audio>
           <p:cMediaNode>
             <p:tgtEl><p:spTgt spid="5"/></p:tgtEl>
           </p:cMediaNode>
         </p:audio>
       </p:timing>
       <a:audioFile r:link="rId2"/>
     </p:sld>`,
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/media1.mp3"/>
     </Relationships>`,
  );
  zip.file("ppt/media/media1.mp3", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("pptx slide audio helpers", () => {
  it("maps common audio extensions to mime types", () => {
    expect(mimeForMediaPath("../media/narration.mp3")).toBe("audio/mpeg");
    expect(mimeForMediaPath("ppt/media/clip.m4a")).toBe("audio/mp4");
    expect(mimeForMediaPath("ppt/media/clip.wav")).toBe("audio/wav");
    expect(mimeForMediaPath("ppt/media/image1.png")).toBeNull();
  });

  it("resolves relative relationship targets into zip paths", () => {
    expect(resolveZipPath("ppt/slides", "../media/media1.mp3")).toBe("ppt/media/media1.mp3");
    expect(resolveZipPath("ppt/slides", "../../ppt/media/a.wav")).toBe("ppt/media/a.wav");
    expect(resolveZipPath("ppt", "slides/slide1.xml")).toBe("ppt/slides/slide1.xml");
    expect(resolveZipPath("ppt/slides", "/ppt/media/x.mp3")).toBe("ppt/media/x.mp3");
  });

  it("parses Relationship attributes regardless of order", () => {
    const xml = `
      <Relationships>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/media1.mp3"/>
        <Relationship Target="../media/media2.wav" Type="http://schemas.microsoft.com/office/2007/relationships/media" Id="rId3"/>
      </Relationships>
    `;
    const rows = parseRelationships(xml);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "rId2", target: "../media/media1.mp3" }),
        expect.objectContaining({ id: "rId3", target: "../media/media2.wav" }),
      ]),
    );
  });

  it("detects audio markers in slide XML", () => {
    expect(slideLooksLikeItHasAudio("<p:audio><a:audioFile r:link=\"rId2\"/></p:audio>")).toBe(
      true,
    );
    expect(slideLooksLikeItHasAudio("<p:sp><p:txBody>Hello</p:txBody></p:sp>")).toBe(false);
  });

  it("recognizes audio relationships and playable mime types", () => {
    expect(
      isAudioRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio",
        "../media/a.bin",
      ),
    ).toBe(true);
    expect(
      isAudioRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video",
        "../media/clip.mp3",
      ),
    ).toBe(true);
    expect(isBrowserPlayableMime("audio/mpeg")).toBe(true);
    expect(isBrowserPlayableMime("audio/x-ms-wma")).toBe(false);
  });

  it("extracts per-slide audio object URLs from a pptx package", async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let seq = 0;
    // jsdom/node vitest env may not implement blob URLs.
    URL.createObjectURL = (() => `blob:pptx-audio-test-${++seq}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    try {
      const buffer = await buildSamplePptx();
      const tracks = await extractPptxSlideAudio(buffer);
      expect(tracks.size).toBe(1);
      const slide0 = tracks.get(0);
      expect(slide0?.[0]?.mimeType).toBe("audio/mpeg");
      expect(slide0?.[0]?.objectUrl).toMatch(/^blob:/);
      for (const list of tracks.values()) {
        for (const track of list) {
          if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
        }
      }
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
