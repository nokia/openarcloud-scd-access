/*
  (c) 2020 Open AR Cloud
  This code is licensed under MIT license (see LICENSE.md for details)

  (c) 2024 Nokia
  Licensed under the MIT License
  SPDX-License-Identifier: MIT
*/

/**
 Main access point to the spatial discovery services of the Open Spatial Computing Platform.
 */

import scrEmpty from './scr.empty.json';
import scrReference from './scr.reference.json';
import scrDefinition from './scr.definition.json';

export * from './authstore';

import { z } from 'zod';

export const positionSchema = z.object({
    lon: z.number(),
    lat: z.number(),
    h: z.number(),
});

export const quaternionSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
});

export const geoPoseSchema = z.object({
    position: positionSchema,
    quaternion: quaternionSchema,
});

/**
 * SpatialDDS 1.8 `spatial::common::Vec3` — JSON array of 3 numbers, or `{x,y,z}`.
 * Canonical on the SpatialDDS JSON wire is `[x, y, z]`.
 */
export const vec3Schema = z.union([z.tuple([z.number(), z.number(), z.number()]), z.array(z.number()).length(3), z.object({ x: z.number(), y: z.number(), z: z.number() })]);

/**
 * SpatialDDS 1.8 `spatial::common::QuaternionXYZW` — JSON array of 4 numbers in GeoPose `(x, y, z, w)` order,
 * or the SCR `{x,y,z,w}` object used by `geopose.quaternion`.
 */
export const quaternionXyzwSchema = z.union([z.tuple([z.number(), z.number(), z.number(), z.number()]), z.array(z.number()).length(4), quaternionSchema]);

/** SpatialDDS 1.8 `builtin::Time` (`@extensibility(APPENDABLE)`). */
export const timeSchema = z
    .object({
        sec: z.number(),
        nanosec: z.number().min(0).max(999_999_999),
    })
    .passthrough();

/** SpatialDDS 1.8 `spatial::common::CoordConvention` (FrameRef, added in 1.6). Default when omitted is ENU. */
export const coordConventionSchema = z.enum(['ENU', 'CV', 'GRAPHICS', 'UNITY_LH', 'NED', 'OTHER']);

/** SpatialDDS 1.8 `spatial::common::CovarianceType`. */
export const covarianceTypeSchema = z.enum(['COV_NONE', 'COV_POS3', 'COV_POSE6', 'COV_ROT3', 'COV_POSE6_TWIST6']);

/**
 * SpatialDDS 1.8 `spatial::core::CovMatrix` JSON shape used in spec examples:
 * `{ "type": "COV_POSE6", "pose": [ ... 36 numbers ] }` (and analogous payloads for other types).
 */
export const covMatrixSchema = z
    .object({
        type: covarianceTypeSchema,
        none: z.unknown().optional(),
        pos: z.array(z.number()).length(9).optional(),
        pose: z.array(z.number()).length(36).optional(),
        rot: z.array(z.number()).length(9).optional(),
        pose_twist: z.array(z.number()).length(144).optional(),
    })
    .passthrough();

/**
 * SpatialDDS 1.8 `spatial::common::FrameRef` on JSON wire (`APPENDABLE`).
 * `uuid` and `fqn` are required; `coord_convention` is optional (absent ⇒ ENU).
 */
export const frameRefSchema = z
    .object({
        uuid: z.string().min(1),
        fqn: z.string().min(1),
        coord_convention: coordConventionSchema.optional(),
        has_coord_convention: z.boolean().optional(),
    })
    .passthrough();

/** SpatialDDS 1.8 Core `PoseSE3`: translation `t` + quaternion `q`. */
export const poseSE3Schema = z
    .object({
        t: vec3Schema,
        q: quaternionXyzwSchema,
    })
    .passthrough();

/**
 * SpatialDDS 1.8 Core `FramedPose` (`pose`, `frame_ref`, optional `cov` / `stamp`).
 * `@extensibility(APPENDABLE)`: unknown keys are kept. Also accepts camelCase `frameRef`.
 */
export const framedPoseSchema = z.preprocess(
    (value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            if (record.frame_ref === undefined && record.frameRef !== undefined) {
                const { frameRef, ...rest } = record;
                return { ...rest, frame_ref: frameRef };
            }
        }
        return value;
    },
    z
        .object({
            pose: poseSE3Schema,
            frame_ref: frameRefSchema,
            cov: covMatrixSchema.optional(),
            stamp: timeSchema.optional(),
        })
        .passthrough()
);

/**
 * Absolute http(s) URL, or a root-relative path in the client public folder.
 * Protocol-relative URLs (`//host/...`) are rejected.
 * Keep this pattern aligned with `RefDto` in oscp-spatial-content-discovery and `scr.schema.json`.
 *
 * Accepted examples:
 * - `https://www.example.com/cat.glb`
 * - `http://www.example.com/mesh.gltf`
 * - `https://example.com:8080/a/b.glb?x=1&y=2#frag`
 * - `/media/pointclouds/cloud1.ply`
 * - `/media/video/video_Nokia105.mp4`
 * - `/file%20name.glb`
 */
export const refUrlPattern = /^(https?:\/\/[^\s]+|\/(?!\/)[\w\-./%~]+)$/;

export const refSchema = z.object({
    contentType: z.string(),
    url: z.string().regex(refUrlPattern, 'url must be an absolute http(s) URL or a root-relative client public path'),
});

export const defSchema = z.object({
    type: z.string(),
    value: z.string(),
});

/**
 * SCR **content** body. Pose must be expressed as OGC `geopose` (geodetic), SpatialDDS `framedPose`
 * (metric, in a named frame), or both. `framedPose`, when present, follows SpatialDDS 1.8 Core
 * (`FramedPose` / `FrameRef` / `PoseSE3`; structs are APPENDABLE).
 */
export const contentSchema = z
    .object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        description: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        placekey: z.string().optional(),
        refs: z.array(refSchema).optional(),
        geopose: geoPoseSchema.optional(),
        framedPose: framedPoseSchema.optional(),
        size: z.number().optional(),
        bbox: z.string().optional(),
        definitions: z.array(defSchema).optional(),
    })
    .superRefine((content, ctx) => {
        if (content.geopose === undefined && content.framedPose === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'At least one of geopose or framedPose is required',
                path: ['geopose'],
            });
        }
    });

export const scrNoIdSchema = z.object({
    type: z.string(),
    content: contentSchema,
    tenant: z.string().optional(),
    timestamp: z.number().optional(),
});

export const scrSchema = scrNoIdSchema.extend({
    id: z.string(),
});

export type SCR = z.infer<typeof scrSchema>;
export type SCRnoId = z.infer<typeof scrNoIdSchema>;
export type Content = z.infer<typeof contentSchema>;
export type Def = z.infer<typeof defSchema>;
export type Ref = z.infer<typeof refSchema>;
export type Geopose = z.infer<typeof geoPoseSchema>;
export type Quaternion = z.infer<typeof quaternionSchema>;
export type Position = z.infer<typeof positionSchema>;
export type FrameRef = z.infer<typeof frameRefSchema>;
export type PoseSE3 = z.infer<typeof poseSE3Schema>;
export type Vec3 = z.infer<typeof vec3Schema>;
export type QuaternionXYZW = z.infer<typeof quaternionXyzwSchema>;
export type Time = z.infer<typeof timeSchema>;
export type CoordConvention = z.infer<typeof coordConventionSchema>;
export type CovMatrix = z.infer<typeof covMatrixSchema>;
export type FramedPose = z.infer<typeof framedPoseSchema>;
// Allows to return local JSON response for debugging
// When this is true, no server access is done, but a local result is returned instead.
export let local = false;

export const scr_schema = scrSchema;
export const scr_empty = scrEmpty;
export const scr_reference = scrReference;
export const scr_definition = scrDefinition;

const GET_METHOD = 'get';
const POST_METHOD = 'post';
const PUT_METHOD = 'put';
const DELETE_METHOD = 'delete';

const scrsPath = 'scrs';

/** Topic lists already fetched, keyed by SCD base URL. */
const supportedTopicsByServer = new Map<string, string[]>();

function resolveBaseUrl(url: string): string {
    const baseUrl = url.trim().replace(/\/+$/, '');
    if (baseUrl === '') {
        throw new Error('SCD URL is not set');
    }
    return baseUrl;
}

function parseTopicList(payload: unknown, url: string): string[] {
    if (!Array.isArray(payload) || payload.some((topic) => typeof topic !== 'string' || topic.trim() === '')) {
        throw new Error(`GET ${url}/topics returned an invalid topic list`);
    }
    return payload.map((topic) => topic.trim().toLowerCase());
}

/**
 * Topic names served by one SCD instance (`GET /topics`).
 * Results are cached per server URL, so several SCD hosts keep separate lists.
 */
export async function getSupportedTopics(url: string): Promise<string[]> {
    const baseUrl = resolveBaseUrl(url);
    const cached = supportedTopicsByServer.get(baseUrl);
    if (cached) {
        return [...cached];
    }

    const response = await request(`${baseUrl}/topics`);
    const topics = parseTopicList(await response.json(), baseUrl);
    supportedTopicsByServer.set(baseUrl, topics);
    return [...topics];
}

/**
 * Whether `topic` is served by the SCD instance at `url`.
 * Comparison is case-insensitive, matching the server's lowercasing of topic path parameters.
 */
export async function isSupportedTopic(url: string, topic: string): Promise<boolean> {
    if (topic === undefined || topic.trim() === '') {
        return false;
    }
    const topics = await getSupportedTopics(url);
    return topics.includes(topic.trim().toLowerCase());
}

/**
 * Requests the available contents in the provided location for a specific topic
 * The location to provide should be approximate, to prevent exposing exact client locations.
 *
 * When the global variable `local` is set to true, no server access is done, but a local result is returned instead.
 */
export async function getContentsAtLocation(url: string, topic: string, h3Index: string, keywords = ''): Promise<SCR[]> {
    if (local) {
        return localResults;
    }

    if (topic === undefined || topic === '' || h3Index === undefined || h3Index === '') {
        throw new Error(`Check parameters: ${topic} ${h3Index}`);
    }

    let keywordsQuery = `&keywords=${keywords}`;
    if (keywords === '') {
        keywordsQuery = '';
    }

    const response = await request(`${url}/${scrsPath}/${topic}?h3Index=${h3Index}` + keywordsQuery);
    return await response.json();
}

/**
 * Requests the available contents in the provided location for a specific topic
 * Kept only for backwards compatibility
 * @deprecated Use getContentsAtLocation() instead
 */
export function getContentAtLocation(url: string, topic: string, h3Index: string, keywords = '') {
    return getContentsAtLocation(url, topic, h3Index, keywords);
}

/**
 * Requests the content with the provided id from the provided topic
 *
 * When the global variable `local` is set to true, no server access is done, but a local result is returned instead.
 */
export async function getContentWithId(url: string, topic: string, id: string): Promise<SCR> {
    if (local) {
        return Promise.resolve(localResult);
    }

    if (id === undefined || id.length < 16) {
        throw new Error(`Check parameters: ${id}`);
    }

    const response = await request(`${url}/${scrsPath}/${topic}/${id}`);
    return await response.json();
}

/**
 * Request all content (for the tenant authorized by the token) in the provided topic.
 */
export async function searchContentsForTenant(url: string, topic: string, token: string) {
    const response = await request(`${url}/tenant/${scrsPath}/${topic}`, GET_METHOD, '', token);
    return (await response.json()) as SCR[];
}

/**
 * Post a single content record (SCR) to the server into the provided topic
 *
 * When the global variable `local` is set to true, no server access is done, but an immediate ok returned.
 */
export async function postContent(url: string, topic: string, scr: SCRnoId, token: string) {
    if (local) {
        return 'OK';
    }

    // token may be empty when the backend runs with auth disabled
    if (token === undefined) {
        throw new Error(`token is invalid: ${token}`);
    }
    scrNoIdSchema.parse(scr);

    const response = await request(`${url}/${scrsPath}/${topic}`, POST_METHOD, JSON.stringify(scr), token);
    return await response.text();
}

/**
 * Post the content of a .json file to the server into the provided topic
 *
 * Reads the contents of the file, validates it against a json schema and posts it to the server.
 */
export async function postScrFile(url: string, topic: string, file: File, token: string) {
    const result = await getFileContent(file);
    const parsedResult = JSON.parse(result);
    const scrNoId = scrNoIdSchema.parse(parsedResult);
    return await postContent(url, topic, scrNoId, token);
}

/**
 * Put a single content record (SCR) to the server into the provided topic
 */
export async function putContent(url: string, topic: string, scr: SCR, id: string, token: string) {
    if (local) {
        return Promise.resolve('OK');
    }

    // token may be empty when the backend runs with auth disabled
    if (id === undefined || id.length === 0 || token === undefined) {
        throw new Error(`Check parameters. id: ${id}, token: ${token}`);
    }
    scrSchema.parse(scr);

    return request(`${url}/${scrsPath}/${topic}/${id}`, PUT_METHOD, JSON.stringify(scr), token).then(async (response) => await response.text());
}

/**
 * Delete Content with provided ID from the provided topic
 */
export async function deleteWithId(url: string, topic: string, id: string, token: string) {
    const response = await request(`${url}/${scrsPath}/${topic}/${id}`, DELETE_METHOD, '', token);
    return await response.text();
}

/**
 * Executes the actual request
 */
async function request(url: string, method = GET_METHOD, body = '', token: string | undefined = undefined) {
    let headers = new Headers();
    // The OSCP type should be application/vnd.oscp+json; version=1.0, but we also accept application/json
    // to be compatible with older SCD services.
    headers.append('accept', 'application/json, application/vnd.oscp+json; version=1.0');
    headers.append('content-type', 'application/json');

    if (token) {
        headers.append('authorization', `Bearer ${token}`);
    }

    const options = {
        method: method,
        headers: headers,
        ...(method === POST_METHOD || method === PUT_METHOD ? { body } : undefined),
    };

    const response = await fetch(url, options);
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(
            `${method.toUpperCase()} ${url} failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
        );
    }
    return response;
}

/**
 * Read the contents of the provided text file
 */
function getFileContent(file: File) {
    return new Promise<string>((resolve, reject) => {
        if (file === undefined) {
            reject('Undefined file provided');
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => {
            reader.abort();
            reject(`Unable to get Content of ${file.name}: ${reader.error}`);
        };

        reader.readAsText(file);
    });
}

/** Local SCR records for testing */
export const localResults = [
    {
        id: 'a3683f12b334dea6',
        type: 'scr',
        content: {
            id: '111',
            type: '3d',
            title: 'cat model',
            keywords: ['cat'],
            url: 'https://www.example.com/cat.glb',
            geopose: { position: { lon: -97.7288818359375, lat: 30.286160447473897, h: 78.34 }, quaternion: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } },
            size: 100,
        },
        tenant: 'oscptest',
        timestamp: 202009,
    },
    {
        id: 'd44a6818c119b51e',
        type: 'scr',
        content: {
            id: '222',
            type: '3d',
            title: 'dog model',
            url: 'https://www.example.com/dog.glb',
            geopose: { position: { lon: -97.7358341217041, lat: 30.28567869039136, h: 78.34 }, quaternion: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } },
            size: 100,
        },
        tenant: 'oscptest',
        timestamp: 20200924,
    },
    {
        id: 'e55b7929d22ac62f',
        type: 'scr',
        content: {
            id: '333',
            type: '3d',
            title: 'framed-only model',
            url: 'https://www.example.com/framed.glb',
            framedPose: {
                frame_ref: { uuid: 'map-room', fqn: 'vendor:MapRoom' },
                pose: {
                    t: [1, 0, -0.5],
                    q: [0, 0, 0, 1],
                },
            },
            size: 50,
        },
        tenant: 'oscptest',
        timestamp: 20200925,
    },
];

/** Local SCR record for testing */
export const localResult = {
    id: 'a3683f12b334dea6',
    type: 'scr',
    content: {
        id: '111',
        type: '3d',
        title: 'cat model',
        keywords: ['cat'],
        url: 'https://www.example.com/cat.glb',
        geopose: { position: { lon: -97.7288818359375, lat: 30.286160447473897, h: 78.34 }, quaternion: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } },
        size: 100,
    },
    tenant: 'oscptest',
    timestamp: 20200924,
};
