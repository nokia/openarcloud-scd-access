/*
  (c) 2026 Open AR Cloud / contributors
  Licensed under the MIT License
  SPDX-License-Identifier: MIT
*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentSchema, scrSchema } from '../index.ts';

describe('contentSchema (GeoPose vs FramedPose)', () => {
    const minimalGeo = {
        id: 'c1',
        type: '3D',
        title: 't',
        geopose: {
            position: { lon: 19, lat: 47, h: 100 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
    };

    const minimalFramed = {
        id: 'c2',
        type: '3D',
        title: 't',
        framedPose: {
            frameRef: { uuid: 'u', fqn: 'f:u' },
            pose: {
                t: { x: 0, y: 0, z: 0 },
                q: { x: 0, y: 0, z: 0, w: 1 },
            },
        },
    };

    it('accepts geopose-only', () => {
        const r = contentSchema.parse(minimalGeo);
        assert.ok(r.geopose);
        assert.strictEqual(r.framedPose, undefined);
    });

    it('accepts framedPose-only', () => {
        const r = contentSchema.parse(minimalFramed);
        assert.ok(r.framedPose);
        assert.strictEqual(r.geopose, undefined);
    });

    it('accepts both geopose and framedPose', () => {
        const r = contentSchema.parse({
            ...minimalGeo,
            framedPose: minimalFramed.framedPose,
        });
        assert.ok(r.geopose);
        assert.ok(r.framedPose);
    });

    it('rejects neither geopose nor framedPose', () => {
        assert.throws(() => {
            contentSchema.parse({
                id: 'c',
                type: '3D',
                title: 't',
            });
        });
    });
});

describe('scrSchema', () => {
    it('parses SCR with framed content', () => {
        const scr = scrSchema.parse({
            id: 'scr1',
            type: 'scr',
            content: {
                id: 'c',
                type: '3D',
                title: 'x',
                framedPose: {
                    frameRef: { uuid: 'a', fqn: 'b' },
                    pose: { t: { x: 1, y: 2, z: 3 }, q: { x: 0, y: 0, z: 0, w: 1 } },
                },
            },
        });
        assert.ok(scr.content.framedPose);
    });
});
