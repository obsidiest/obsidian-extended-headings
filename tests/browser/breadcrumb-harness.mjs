import { EditorState } from "@codemirror/state";
import { EditorView, gutter, GutterMarker } from "@codemirror/view";
import { MarkdownView } from "obsidian";
import { HeadingBreadcrumb } from "../../src/heading-breadcrumb";
import { DEFAULT_BREADCRUMB_SETTINGS } from "../../src/breadcrumb-settings";
import { breadcrumbHighlightField } from "../../src/breadcrumb-editor";
import { renderExtendedHeadings } from "../../src/reading";
Object.assign(window, {
    renderExtendedHeadings,
    createEl: (tag) => document.createElement(tag),
    createDiv: () => document.createElement("div"),
    createSpan: () => document.createElement("span"),
    createFragment: () => document.createDocumentFragment(),
});
Object.assign(document, { win: window });
class Marker extends GutterMarker {
    level;
    constructor(level) {
        super();
        this.level = level;
    }
    eq(other) { return other instanceof Marker && other.level === this.level; }
    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-heading-marker";
        el.dataset.level = String(this.level);
        el.textContent = `H${this.level}`;
        return el;
    }
}
let cleanup = () => { };
Object.assign(window, { setupBreadcrumb: (settingsOverrides = {}, options = {}) => {
        cleanup();
        document.body.replaceChildren();
        const root = document.createElement("div");
        root.className = "workspace-leaf-content breadcrumb-test-editor";
        const source = document.createElement("div");
        source.className = `markdown-source-view mod-cm6${options.mode === "livePreview" ? " is-live-preview" : ""}`;
        root.append(source);
        document.body.append(root);
        const lines = Array.from({ length: 12 }, (_, i) => `${"#".repeat(i + 1)} ${i + 1}. Test \`LATEST VERSION NUMBER\` locally first — a deliberately long heading with parentheses (and more text) to exercise wrapping`);
        const cm = new EditorView({ parent: source, state: EditorState.create({ doc: options.text ?? lines.join("\n"), extensions: [
                    breadcrumbHighlightField,
                    gutter({ class: "cm-extended-heading-gutter", lineMarker(view, line) {
                            const level = /^#+/.exec(view.state.doc.lineAt(line.from).text)?.[0].length;
                            return level ? new Marker(level) : null;
                        } }),
                ] }) });
        const view = Object.assign(new MarkdownView(), { file: { path: "Test.md" }, containerEl: root,
            getMode: () => "source", editor: { cm, getValue: () => cm.state.doc.toString(), focus: () => cm.focus() } });
        if (options.outline) {
            const outline = document.createElement("div"); outline.dataset.type = "outline";
            outline.className = "breadcrumb-test-outline";
            root.classList.add("breadcrumb-test-has-outline");
            for (let i = 1; i <= cm.state.doc.lines; i++) {
                const line = cm.state.doc.line(i), level = /^#+/.exec(line.text)?.[0].length;
                if (!level) continue;
                const row = document.createElement("div"); row.className = "tree-item-self";
                row.dataset.extendedBreadcrumbFile = "Test.md"; row.dataset.extendedBreadcrumbLine = String(i - 1);
                const marker = document.createElement("span"); marker.className = "extended-heading-outline-level-marker";
                marker.dataset.level = String(level); marker.textContent = `H${level}`;
                row.append(marker, document.createTextNode(line.text.replace(/^#+\s*/, ""))); outline.append(row);
            }
            document.body.append(outline);
        }
        const settings = { ...DEFAULT_BREADCRUMB_SETTINGS, maximumLevel: 12, ...settingsOverrides };
        const handlers = new Map();
        const plugin = { settings, registerEvent() { }, app: { workspace: {
                    getLeavesOfType: (type) => type === "markdown" ? [{ view }] : [],
                    onLayoutReady: (callback) => callback(), on: (name, callback) => { handlers.set(name, callback); return {}; },
                } } };
        const manager = new HeadingBreadcrumb(plugin);
        manager.start();
        Object.assign(window, { breadcrumbTest: { cm, manager, settings, view, handlers } });
        cleanup = () => { manager.destroy(); cm.destroy(); };
    } });
