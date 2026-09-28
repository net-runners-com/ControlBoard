/* `controlboard mcp` の本体。標準入出力で MCP を話し、サイトの API を呼ぶ。
   標準出力は JSON-RPC 専用なので、ログは標準エラーへ。 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "./client.js";
import { TOOLS } from "./tools.js";

const text = (v) => [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }];

export const listTools = () =>
  TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));

/* 失敗は例外にせず isError で返す。AI がメッセージを読んで直せるように。 */
export async function callTool(client, name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, content: text("知らないツールです: " + name) };
  try {
    return { content: text(await tool.run(client, args || {})) };
  } catch (e) {
    return { isError: true, content: text(e.message || String(e)) };
  }
}

export async function startMcp({ url, token, basic }) {
  const client = createClient({ url, token, basic });
  const server = new Server(
    { name: "controlboard", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: "ControlBoard で作ったサイトの管理画面と同じ操作ができる。編集の前に get_site_schema で構成を確かめ、get_content / get_page で今の状態を取ってから、直した全体を送ること。保存はそのまま公開される。",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(client, req.params.name, req.params.arguments));
  await server.connect(new StdioServerTransport());
  console.error(`controlboard mcp: ${client.origin} に接続します`);
}
