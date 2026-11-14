// The user's config file, squero.toml, shared with Squero Studio OM: $XDG_CONFIG_HOME/paperboat
// (else ~/.config/paperboat) on Linux and macOS, %APPDATA%\paperboat on Windows. The server only
// reads and writes the text; @paperboat/shared/editor parses it and patches single keys.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { shortRoot } from "./workspace.mjs";

const configDir = () =>
  process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "paperboat")
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "paperboat");

export const CONFIG_FILE = path.join(configDir(), "squero.toml");

/** GET: {path, text} (text null with no file yet); PUT: the body becomes the file. */
export const configMiddleware = (file = CONFIG_FILE) => async (req, res) => {
  try {
    if (req.method === "PUT") {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 1 << 20) throw new Error("config file over 1 MB");
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
      res.end();
      return;
    }
    const text = await fs.readFile(file, "utf8").catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: shortRoot(file), text }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : String(e));
  }
};
