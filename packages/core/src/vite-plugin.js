/* サイトの controlboard.config.js を、実行時コード（API・middleware）と
   管理画面の両方から同じ名前で読めるようにする。 */
export const VIRTUAL_ID = "virtual:controlboard/config";
const RESOLVED = "\0" + VIRTUAL_ID;

export function configPlugin(configPath) {
  return {
    name: "controlboard-config",
    resolveId(id) { if (id === VIRTUAL_ID) return RESOLVED; },
    load(id) {
      if (id !== RESOLVED) return;
      return [
        `import raw from ${JSON.stringify(configPath)};`,
        `import { normalizeConfig } from "@controlboard/core/config";`,
        `export default normalizeConfig(raw);`,
      ].join("\n");
    },
  };
}
