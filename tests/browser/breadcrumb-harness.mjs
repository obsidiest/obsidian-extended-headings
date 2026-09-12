import { EditorState } from "@codemirror/state";
import { EditorView, gutter, GutterMarker } from "@codemirror/view";
import { MarkdownView } from "obsidian";
import { HeadingBreadcrumb } from "../../src/heading-breadcrumb";
import { DEFAULT_BREADCRUMB_SETTINGS } from "../../src/breadcrumb-settings";
import { breadcrumbHighlightField } from "../../src/breadcrumb-editor";
Object.assign(window, {
    createEl: (tag) => document.createElement(tag),
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
    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-heading-marker";
        el.dataset.level = String(this.level);
        el.textContent = `H${this.level}`;
        return el;
    }
}
let cleanup = () => { };
Object.assign(window, { setupBreadcrumb: (settingsOverrides = {}) => {
        cleanup();
        document.body.replaceChildren();
        const root = document.createElement("div");
        root.className = "workspace-leaf-content breadcrumb-test-editor";
        const source = document.createElement("div");
        source.className = "markdown-source-view mod-cm6";
        root.append(source);
        document.body.append(root);
        const lines = Array.from({ length: 12 }, (_, i) => `${"#".repeat(i + 1)} ${i + 1}. Test \`LATEST VERSION NUMBER\` locally first — a deliberately long heading with parentheses (and more text) to exercise wrapping`);
        const cm = new EditorView({ parent: source, state: EditorState.create({ doc: lines.join("\n"), extensions: [
                    breadcrumbHighlightField,
                    gutter({ class: "cm-extended-heading-gutter", lineMarker(view, line) {
                            const level = /^#+/.exec(view.state.doc.lineAt(line.from).text)?.[0].length;
                            return level ? new Marker(level) : null;
                        } }),
                ] }) });
        const view = Object.assign(new MarkdownView(), { file: { path: "Test.md" }, containerEl: root,
            getMode: () => "source", editor: { cm, getValue: () => cm.state.doc.toString(), focus: () => cm.focus() } });
        const settings = { ...DEFAULT_BREADCRUMB_SETTINGS, maximumLevel: 12, ...settingsOverrides };
        const plugin = { settings, registerEvent() { }, app: { workspace: {
                    getLeavesOfType: (type) => type === "markdown" ? [{ view }] : [],
                    onLayoutReady: (callback) => callback(), on: () => ({}),
                } } };
        const manager = new HeadingBreadcrumb(plugin);
        manager.start();
        Object.assign(window, { breadcrumbTest: { cm, manager, settings } });
        cleanup = () => { manager.destroy(); cm.destroy(); };
    } });
