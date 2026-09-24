/* E2E 用に、ローカル KV（.wrangler/state）へオーナーを1人入れる。実アカウントには触れない。 */
import { execFileSync } from "node:child_process";
export default () => {
  execFileSync("node", ["../packages/cli/src/index.js", "create-owner", "--user", "e2e", "--password", "e2e-pass-1", "--no-change"], { stdio: "inherit" });
};
