#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import https from "node:https";

const API_KEY = process.env.OBSIDIAN_API_KEY || "";
const HOST = process.env.OBSIDIAN_HOST || "127.0.0.1";
const PORT = parseInt(process.env.OBSIDIAN_PORT || "27124", 10);
const ALLOW_WRITES = String(process.env.OBSIDIAN_ALLOW_WRITES ?? "true").toLowerCase() !== "false";
const ALLOW_DELETE = String(process.env.OBSIDIAN_ALLOW_DELETE ?? "false").toLowerCase() === "true";

// Local self-signed cert from the Local REST API plugin. Traffic never leaves the machine (127.0.0.1).
const agent = new https.Agent({ rejectUnauthorized: false });

function encodePath(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

function obsidianRequest(method, path, { headers = {}, body = null, params = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("No Obsidian API key set. Open this extension's settings and paste the key from the Local REST API plugin."));
      return;
    }
    let search = "";
    if (params) search = "?" + new URLSearchParams(params).toString();
    const opts = {
      method, hostname: HOST, port: PORT, path: path + search, agent,
      headers: { Authorization: `Bearer ${API_KEY}`, ...headers },
      timeout: 8000,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        let msg = data;
        try { const j = JSON.parse(data); msg = j.message || data; } catch {}
        reject(new Error(`Obsidian API error ${res.statusCode}: ${msg}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("Timed out. Is Obsidian open with the Local REST API plugin enabled?")));
    req.on("error", (e) => {
      if (e.code === "ECONNREFUSED") reject(new Error("Could not reach Obsidian. Make sure Obsidian is running and the Local REST API plugin is enabled."));
      else reject(e);
    });
    if (body != null) req.write(body);
    req.end();
  });
}

const impl = {
  async obsidian_list_files_in_vault() {
    return JSON.parse(await obsidianRequest("GET", "/vault/")).files.join("\n");
  },
  async obsidian_list_files_in_dir({ dirpath }) {
    return JSON.parse(await obsidianRequest("GET", `/vault/${encodePath(dirpath)}/`)).files.join("\n");
  },
  async obsidian_get_file_contents({ filepath }) {
    return await obsidianRequest("GET", `/vault/${encodePath(filepath)}`);
  },
  async obsidian_batch_get_file_contents({ filepaths }) {
    let out = "";
    for (const fp of filepaths) {
      try { out += `# ${fp}\n\n${await obsidianRequest("GET", `/vault/${encodePath(fp)}`)}\n\n---\n\n`; }
      catch (e) { out += `# ${fp}\n\nError reading file: ${e.message}\n\n---\n\n`; }
    }
    return out;
  },
  async obsidian_simple_search({ query, context_length = 100 }) {
    return await obsidianRequest("POST", "/search/simple/", { params: { query, contextLength: context_length } });
  },
  async obsidian_complex_search({ query }) {
    return await obsidianRequest("POST", "/search/", { headers: { "Content-Type": "application/vnd.olrapi.jsonlogic+json" }, body: JSON.stringify(query) });
  },
  async obsidian_get_periodic_note({ period }) {
    return await obsidianRequest("GET", `/periodic/${encodeURIComponent(period)}/`);
  },
  async obsidian_get_recent_periodic_notes({ period, limit = 5, include_content = false }) {
    return await obsidianRequest("GET", `/periodic/${encodeURIComponent(period)}/recent`, { params: { limit, includeContent: include_content } });
  },
  async obsidian_get_recent_changes({ limit = 10, days = 90 }) {
    const dql = [`TABLE file.mtime`, `WHERE file.mtime >= date(today) - dur(${days} days)`, `SORT file.mtime DESC`, `LIMIT ${limit}`].join("\n");
    return await obsidianRequest("POST", "/search/", { headers: { "Content-Type": "application/vnd.olrapi.dataview.dql+txt" }, body: dql });
  },
  async obsidian_append_content({ filepath, content }) {
    await obsidianRequest("POST", `/vault/${encodePath(filepath)}`, { headers: { "Content-Type": "text/markdown" }, body: content });
    return `Appended content to ${filepath}`;
  },
  async obsidian_patch_content({ filepath, operation, target_type, target, content }) {
    await obsidianRequest("PATCH", `/vault/${encodePath(filepath)}`, { headers: { "Content-Type": "text/markdown", Operation: operation, "Target-Type": target_type, Target: encodeURIComponent(target) }, body: content });
    return `Patched ${filepath}`;
  },
  async obsidian_delete_file({ filepath, confirm }) {
    if (confirm !== true) throw new Error("Deletion requires confirm=true.");
    await obsidianRequest("DELETE", `/vault/${encodePath(filepath)}`);
    return `Deleted ${filepath}`;
  },
};

const READ = { readOnlyHint: true, openWorldHint: false, idempotentHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  { perm: "read", name: "obsidian_list_files_in_vault", description: "List all files and directories in the vault root.", inputSchema: { type: "object", properties: {} }, annotations: { title: "List vault files", ...READ } },
  { perm: "read", name: "obsidian_list_files_in_dir", description: "List files and directories inside a specific folder of the vault.", inputSchema: { type: "object", properties: { dirpath: { type: "string", description: "Folder path relative to the vault root." } }, required: ["dirpath"] }, annotations: { title: "List folder", ...READ } },
  { perm: "read", name: "obsidian_get_file_contents", description: "Return the full content of a single note.", inputSchema: { type: "object", properties: { filepath: { type: "string", description: "File path relative to the vault root." } }, required: ["filepath"] }, annotations: { title: "Read note", ...READ } },
  { perm: "read", name: "obsidian_batch_get_file_contents", description: "Return the contents of several notes at once, concatenated with headers.", inputSchema: { type: "object", properties: { filepaths: { type: "array", items: { type: "string" }, description: "List of file paths relative to the vault root." } }, required: ["filepaths"] }, annotations: { title: "Read several notes", ...READ } },
  { perm: "read", name: "obsidian_simple_search", description: "Full-text search across the vault for a text query.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Text to search for." }, context_length: { type: "number", description: "Characters of context around each match (default 100)." } }, required: ["query"] }, annotations: { title: "Search vault", ...READ } },
  { perm: "read", name: "obsidian_complex_search", description: "Advanced search using a JsonLogic query (e.g. match files by glob).", inputSchema: { type: "object", properties: { query: { type: "object", description: "A JsonLogic query object." } }, required: ["query"] }, annotations: { title: "Advanced search", ...READ } },
  { perm: "read", name: "obsidian_get_periodic_note", description: "Get the current daily/weekly/monthly/quarterly/yearly note.", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["daily", "weekly", "monthly", "quarterly", "yearly"], description: "Period type." } }, required: ["period"] }, annotations: { title: "Get periodic note", ...READ } },
  { perm: "read", name: "obsidian_get_recent_periodic_notes", description: "Get the most recent periodic notes of a given period type.", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["daily", "weekly", "monthly", "quarterly", "yearly"] }, limit: { type: "number", description: "Max notes to return (default 5)." }, include_content: { type: "boolean", description: "Include note content (default false)." } }, required: ["period"] }, annotations: { title: "Recent periodic notes", ...READ } },
  { perm: "read", name: "obsidian_get_recent_changes", description: "List recently modified notes in the vault.", inputSchema: { type: "object", properties: { limit: { type: "number", description: "Max files (default 10)." }, days: { type: "number", description: "Only files modified within this many days (default 90)." } } }, annotations: { title: "Recent changes", ...READ } },
  { perm: "write", name: "obsidian_append_content", description: "Append markdown content to a new or existing note.", inputSchema: { type: "object", properties: { filepath: { type: "string", description: "File path relative to the vault root." }, content: { type: "string", description: "Markdown content to append." } }, required: ["filepath", "content"] }, annotations: { title: "Append to note", ...WRITE } },
  { perm: "write", name: "obsidian_patch_content", description: "Insert content into a note relative to a heading, block reference, or frontmatter field.", inputSchema: { type: "object", properties: { filepath: { type: "string" }, operation: { type: "string", enum: ["append", "prepend", "replace"] }, target_type: { type: "string", enum: ["heading", "block", "frontmatter"] }, target: { type: "string", description: "Heading path, block reference, or frontmatter field." }, content: { type: "string" } }, required: ["filepath", "operation", "target_type", "target", "content"] }, annotations: { title: "Patch note", ...WRITE } },
  { perm: "delete", name: "obsidian_delete_file", description: "Permanently delete a file or directory from the vault.", inputSchema: { type: "object", properties: { filepath: { type: "string", description: "Path relative to the vault root." }, confirm: { type: "boolean", description: "Must be true to confirm deletion." } }, required: ["filepath", "confirm"] }, annotations: { title: "Delete file", ...DESTRUCTIVE } },
];

function allowed(perm) {
  if (perm === "read") return true;
  if (perm === "write") return ALLOW_WRITES;
  if (perm === "delete") return ALLOW_DELETE;
  return false;
}

const server = new Server({ name: "obsidian", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.filter((t) => allowed(t.perm)).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  if (!allowed(tool.perm)) return { content: [{ type: "text", text: `This tool is disabled in the extension settings (${tool.perm} permission).` }], isError: true };
  try {
    const result = await impl[name](args);
    return { content: [{ type: "text", text: String(result ?? "") }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("obsidian mcp server ready");
