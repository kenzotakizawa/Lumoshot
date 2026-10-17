import { ASSET_PREFIX, assetRefsInState } from '../editor/utils/snapshotAssets';

// `.lumoshot` project files: editable snapshots a user can save and reopen
// later (another PC, a backup, the extension ↔ web app).
//
// {
//   "app": "lumoshot",
//   "formatVersion": 1,
//   "savedAt": 1792200000000,
//   "projects": [{ "name": "...", "state": "<editor snapshot JSON>", "thumbnail": "data:image/jpeg;base64,..." }],
//   "assets": { "<hash>": "data:image/png;base64,..." }
// }
//
// `projects` is an array so one file can carry several projects later.
//
// These files come from outside, so parsing is strict: every image must be an
// inline raster data URL (or a ref into `assets`). A URL in a snapshot would
// make the editor fetch it on open — leaving the "everything stays on your
// device" promise broken — and SVG isn't accepted either.

export const LUMOSHOT_FILE_EXTENSION = '.lumoshot';
export const LUMOSHOT_FILE_VERSION = 1;
export const MAX_LUMOSHOT_FILE_BYTES = 200 * 1024 * 1024;
const MAX_PROJECTS = 100;
const MAX_NAME_LENGTH = 200;

export interface LumoshotFileProject {
    name: string;
    state: string;
    thumbnail: string;
}

export interface LumoshotFile {
    app: 'lumoshot';
    formatVersion: number;
    savedAt: number;
    projects: LumoshotFileProject[];
    assets: Record<string, string>;
}

export type LumoshotFileErrorCode = 'too-large' | 'not-json' | 'not-lumoshot' | 'newer-version' | 'invalid';

export class LumoshotFileError extends Error {
    code: LumoshotFileErrorCode;
    constructor(code: LumoshotFileErrorCode, detail?: string) {
        super(detail ? `${code}: ${detail}` : code);
        this.code = code;
    }
}

const RASTER_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]*$/;
const ASSET_HASH = /^[0-9a-z]{1,40}$/;

export const isRasterDataUrl = (v: unknown): v is string => typeof v === 'string' && RASTER_DATA_URL.test(v);

export function isLumoshotFileName(name: string): boolean {
    return name.toLowerCase().endsWith(LUMOSHOT_FILE_EXTENSION);
}

// A file-system friendly base name (no extension).
export function safeFileBaseName(name: string): string {
    const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100);
    return cleaned || 'lumoshot';
}

export function defaultProjectName(date: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `lumoshot_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

export function buildLumoshotFile(projects: LumoshotFileProject[], assets: Record<string, string>, savedAt: number = Date.now()): string {
    const file: LumoshotFile = { app: 'lumoshot', formatVersion: LUMOSHOT_FILE_VERSION, savedAt, projects, assets };
    return JSON.stringify(file);
}

// Every `src` / `source` (fabric images, pattern fills, canvas background /
// overlay images) anywhere in a snapshot must be a raster data URL or a ref to
// a known asset.
function checkImageSources(node: unknown, assets: Record<string, string>, path: string): void {
    if (Array.isArray(node)) {
        node.forEach((child, i) => checkImageSources(child, assets, `${path}[${i}]`));
        return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if ((key === 'src' || key === 'source') && value !== undefined && value !== null && typeof value !== 'object') {
            if (typeof value !== 'string') throw new LumoshotFileError('invalid', `${path}.${key} is not a string`);
            if (value.startsWith(ASSET_PREFIX)) {
                if (!Object.prototype.hasOwnProperty.call(assets, value.slice(ASSET_PREFIX.length))) {
                    throw new LumoshotFileError('invalid', `${path}.${key} refers to a missing image`);
                }
            } else if (!isRasterDataUrl(value)) {
                throw new LumoshotFileError('invalid', `${path}.${key} is not an embedded PNG/JPEG/WebP/GIF image`);
            }
        } else {
            checkImageSources(value, assets, `${path}.${key}`);
        }
    }
}

export function parseLumoshotFile(text: string): LumoshotFile {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new LumoshotFileError('not-json');
    }
    if (!raw || typeof raw !== 'object' || (raw as any).app !== 'lumoshot') throw new LumoshotFileError('not-lumoshot');
    const r = raw as Record<string, unknown>;

    if (typeof r.formatVersion !== 'number' || !Number.isInteger(r.formatVersion) || r.formatVersion < 1) {
        throw new LumoshotFileError('invalid', 'formatVersion');
    }
    if (r.formatVersion > LUMOSHOT_FILE_VERSION) throw new LumoshotFileError('newer-version');

    // assets
    const assets: Record<string, string> = {};
    if (r.assets !== undefined) {
        if (!r.assets || typeof r.assets !== 'object' || Array.isArray(r.assets)) throw new LumoshotFileError('invalid', 'assets');
        for (const [hash, data] of Object.entries(r.assets as Record<string, unknown>)) {
            if (!ASSET_HASH.test(hash)) throw new LumoshotFileError('invalid', `asset key ${hash}`);
            if (!isRasterDataUrl(data)) throw new LumoshotFileError('invalid', `asset ${hash} is not an embedded PNG/JPEG/WebP/GIF image`);
            assets[hash] = data;
        }
    }

    // projects
    if (!Array.isArray(r.projects) || r.projects.length === 0 || r.projects.length > MAX_PROJECTS) {
        throw new LumoshotFileError('invalid', 'projects');
    }
    const projects: LumoshotFileProject[] = r.projects.map((p: unknown, i: number) => {
        if (!p || typeof p !== 'object') throw new LumoshotFileError('invalid', `projects[${i}]`);
        const { name, state, thumbnail } = p as Record<string, unknown>;
        if (typeof state !== 'string') throw new LumoshotFileError('invalid', `projects[${i}].state`);
        let parsed: any;
        try {
            parsed = JSON.parse(state);
        } catch {
            throw new LumoshotFileError('invalid', `projects[${i}].state is not JSON`);
        }
        const canvasData = parsed?.canvasData ?? parsed;
        if (!canvasData || typeof canvasData !== 'object' || !Array.isArray(canvasData.objects)) {
            throw new LumoshotFileError('invalid', `projects[${i}].state has no canvas`);
        }
        checkImageSources(parsed, assets, `projects[${i}].state`);
        if (thumbnail !== undefined && thumbnail !== '' && !isRasterDataUrl(thumbnail)) {
            throw new LumoshotFileError('invalid', `projects[${i}].thumbnail`);
        }
        return {
            name: typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '',
            state,
            thumbnail: typeof thumbnail === 'string' ? thumbnail : '',
        };
    });

    return {
        app: 'lumoshot',
        formatVersion: r.formatVersion,
        savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0,
        projects,
        assets,
    };
}

export async function readLumoshotFile(file: File): Promise<LumoshotFile> {
    if (file.size > MAX_LUMOSHOT_FILE_BYTES) throw new LumoshotFileError('too-large');
    return parseLumoshotFile(await file.text());
}

// Name to give an imported project. For a single-project file the file name
// wins (people rename files in Finder/Explorer); otherwise the stored name.
export function importedProjectName(file: LumoshotFile, project: LumoshotFileProject, fileName: string): string {
    const base = fileName.replace(/\.lumoshot$/i, '').trim();
    if (file.projects.length === 1 && base) return base.slice(0, MAX_NAME_LENGTH);
    return project.name;
}

// Only the assets one project's state actually references.
export function assetsForProject(file: LumoshotFile, project: LumoshotFileProject): Record<string, string> {
    const out: Record<string, string> = {};
    for (const hash of assetRefsInState(project.state)) if (file.assets[hash]) out[hash] = file.assets[hash];
    return out;
}

export function lumoshotFileErrorMessage(err: unknown, isJa: boolean): string {
    const code = err instanceof LumoshotFileError ? err.code : 'invalid';
    const messages: Record<LumoshotFileErrorCode, [string, string]> = {
        'too-large': ['ファイルが大きすぎて開けません（上限200MB）。', 'This file is too large to open (limit 200MB).'],
        'not-json': ['Lumoshot のファイルとして読み込めませんでした。ファイルが壊れている可能性があります。', 'Could not read this as a Lumoshot file. It may be damaged.'],
        'not-lumoshot': ['Lumoshot の編集データ（.lumoshot）ではありません。', 'This is not a Lumoshot project file (.lumoshot).'],
        'newer-version': ['新しいバージョンの Lumoshot で作られたファイルです。Lumoshot を更新してから開いてください。', 'This file was made by a newer version of Lumoshot. Update Lumoshot and try again.'],
        'invalid': ['ファイルの内容が正しくないため開けませんでした。', 'This file has invalid contents and could not be opened.'],
    };
    return messages[code][isJa ? 0 : 1];
}
