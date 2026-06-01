import { type Auth, type drive_v3, google } from "googleapis";
import { NetworkError } from "../errors/index.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface UploadJSONParams {
  parentId: string;
  name: string;
  body: unknown;
  overwriteFileId?: string;
}

export interface UploadMarkdownParams {
  parentId: string;
  name: string;
  body: string;
  overwriteFileId?: string;
}

export class DriveClient {
  private readonly drive: drive_v3.Drive;

  constructor(auth: Auth.OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async findChild(parentId: string, name: string): Promise<string | null> {
    const q = `'${parentId}' in parents and name = '${escapeQueryValue(name)}' and trashed = false`;
    const res = await this.drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
    return res.data.files?.[0]?.id ?? null;
  }

  async createFolder(parentId: string, name: string): Promise<string> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive createFolder: no id for ${name}`);
    return res.data.id;
  }

  async ensureFolderPath(segments: string[]): Promise<string> {
    let parent = "root";
    for (const name of segments) {
      const existing = await this.findChild(parent, name);
      parent = existing ?? (await this.createFolder(parent, name));
    }
    return parent;
  }

  async uploadJSON(p: UploadJSONParams): Promise<string> {
    const media = { mimeType: "application/json", body: JSON.stringify(p.body, null, 2) };
    if (p.overwriteFileId) {
      const res = await this.drive.files.update({
        fileId: p.overwriteFileId,
        media,
        fields: "id",
      });
      if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
      return res.data.id;
    }
    const res = await this.drive.files.create({
      requestBody: { name: p.name, parents: [p.parentId] },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
    return res.data.id;
  }

  async uploadMarkdown(p: UploadMarkdownParams): Promise<string> {
    const media = { mimeType: "text/markdown", body: p.body };
    if (p.overwriteFileId) {
      const res = await this.drive.files.update({
        fileId: p.overwriteFileId,
        media,
        fields: "id",
      });
      if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
      return res.data.id;
    }
    const res = await this.drive.files.create({
      requestBody: { name: p.name, parents: [p.parentId] },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
    return res.data.id;
  }

  async listChildren(parentId: string): Promise<Array<{ id: string; name: string }>> {
    const all: Array<{ id: string; name: string }> = [];
    let pageToken: string | undefined;
    do {
      const params: drive_v3.Params$Resource$Files$List = {
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 1000,
      };
      if (pageToken) params.pageToken = pageToken;
      const res = await this.drive.files.list(params);
      for (const f of res.data.files ?? []) {
        if (f.id && f.name) all.push({ id: f.id, name: f.name });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return all;
  }
}

function escapeQueryValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
