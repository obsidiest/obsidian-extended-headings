// Read the flat scalar fields needed by the color adapter from the actual
// Style Settings YAML block. Nested selector options are deliberately ignored.
export function themedColorSchema(css) {
  const yaml = css.match(/\/\* @settings([\s\S]*?)\*\//)[1];
  return yaml.split(/\n {2}-\s*\n/).slice(1).flatMap(block => {
    const fields = Object.fromEntries([...block.matchAll(/^ {4}([\w-]+): (.*)$/gm)]
      .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, "")]));
    return fields.type === "variable-themed-color" ? [fields] : [];
  });
}
