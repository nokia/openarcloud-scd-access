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

/** SpatialDDS-style `Vec3` (`x`, `y`, `z`). */
export const vec3Schema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
});

/** SpatialDDS `spatial::common::FrameRef` on JSON wire. */
export const frameRefSchema = z.object({
    uuid: z.string().min(1),
    fqn: z.string().min(1),
});

/** SpatialDDS Core `PoseSE3`: translation `t` + quaternion `q`. */
export const poseSE3Schema = z.object({
    t: vec3Schema,
    q: quaternionSchema,
});

/**
 * SpatialDDS-style **FramedPose** for SCR content (pose expressed in **frameRef**).
 * Optional `cov` / `stamp` are accepted as structured or unknown JSON for forward compatibility.
 */
export const framedPoseSchema = z.object({
    frameRef: frameRefSchema,
    pose: poseSE3Schema,
    cov: z.unknown().optional(),
    stamp: z
        .object({
            sec: z.number(),
            nanosec: z.number(),
        })
        .optional(),
});

export const refSchema = z.object({
    contentType: z.string(),
    url: z.string().url(),
});

export const defSchema = z.object({
    type: z.string(),
    value: z.string(),
});

/**
 * SCR **content** body: requires **geopose** and/or **framedPose** (at least one).
 * Legacy records supply **geopose** only; indoor / metric content may use **framedPose** only.
 */
const contentSchemaBase = z.object({
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
});

export const contentSchema = contentSchemaBase.superRefine((data, ctx) => {
    if (data.geopose === undefined && data.framedPose === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'SCR content must include geopose and/or framedPose',
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
    headers.append('accept', 'application/vnd.oscp+json; version=1.0;');
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
        throw new Error(`${await response.text()}, ${response.statusText}`);
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
                frameRef: { uuid: 'map-room', fqn: 'vendor:MapRoom' },
                pose: {
                    t: { x: 1, y: 0, z: -0.5 },
                    q: { x: 0, y: 0, z: 0, w: 1 },
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
