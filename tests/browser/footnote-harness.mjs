import "./breadcrumb-harness.mjs";
import { Component, TFile } from "obsidian";
import { CoreOutlineRenderer } from "../../src/core-outline-svg.ts";
import { installHostDOM } from "./host-dom.mjs";

window.setupFootnoteOutline = async (fixture, doc = document) => {
  installHostDOM(doc.defaultView);
  const container = doc.body.createDiv({ cls: "footnote-test-outline", attr: { "data-type": "outline" } });
  for (const heading of fixture.headings) {
    container.createDiv({ cls: "tree-item-self" }).createDiv({ cls: "tree-item-inner", text: heading.coreLabel });
  }
  const file = Object.assign(new TFile(), { path: "Footnotes.md" });
  const renderer = new CoreOutlineRenderer({
    settings: { maximumLevel: 12, renderMarkdownInDefaultOutline: true, showOutlinePaneHeadingLevelMarkers: true },
    app: { workspace: { getLeavesOfType: () => [], getActiveFile: () => file }, metadataCache: { getFileCache: () => fixture.cache },
      vault: { cachedRead: async () => fixture.source } },
  });
  const leaf = { view: { file } };
  const attachment = { leaf, container, revision: 0, rowsBySpecIndex: new Map(), markdownCacheSignature: "", markdownTemplates: new Map(),
    observer: new doc.defaultView.MutationObserver(() => {}), overlay: null, guideLayer: null, threadLayer: null, markdownComponent: new Component() };
  renderer.started = true; renderer.attachments.set(leaf, attachment);
  await renderer.runPass(attachment);
  return container;
};
