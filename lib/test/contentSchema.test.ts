/*
  (c) 2026 Open AR Cloud / contributors
  Licensed under the MIT License
  SPDX-License-Identifier: MIT
*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentSchema, framedPoseSchema, scrNoIdSchema, scrSchema } from '../index.ts';
import emptyScr from '../scr.empty.json';
import scrJsonSchema from '../scr.schema.json';
import geoSample from '../../test/scr.json';
import framedSample from '../../test/scr-framed.json';

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

    const spatialDdsFramed = {
        pose: { t: [0, 0, 0] as [number, number, number], q: [0, 0, 0, 1] as [number, number, number, number] },
        frame_ref: { uuid: 'u', fqn: 'f:u' },
    };

    const camelFramed = {
        frameRef: { uuid: 'u', fqn: 'f:u' },
        pose: {
            t: { x: 0, y: 0, z: 0 },
            q: { x: 0, y: 0, z: 0, w: 1 },
        },
    };

    it('accepts geopose-only', () => {
        const r = contentSchema.parse(minimalGeo);
        assert.ok(r.geopose);
        assert.strictEqual(r.framedPose, undefined);
    });

    it('rejects content with neither geopose nor framedPose', () => {
        assert.throws(() => {
            contentSchema.parse({
                id: 'c',
                type: '3D',
                title: 't',
            });
        });
    });

    it('accepts optional SpatialDDS framedPose (arrays + frame_ref)', () => {
        const r = contentSchema.parse({
            id: 'c2',
            type: '3D',
            title: 't',
            framedPose: spatialDdsFramed,
        });
        assert.ok(r.framedPose);
        assert.strictEqual(r.geopose, undefined);
        assert.deepEqual(r.framedPose?.frame_ref.uuid, 'u');
    });

    it('accepts camelCase frameRef alias and object Vec3/quaternion', () => {
        const r = framedPoseSchema.parse(camelFramed);
        assert.equal(r.frame_ref.fqn, 'f:u');
    });

    it('accepts both geopose and framedPose', () => {
        const r = contentSchema.parse({
            ...minimalGeo,
            framedPose: spatialDdsFramed,
        });
        assert.ok(r.geopose);
        assert.ok(r.framedPose);
    });

    it('accepts optional coord_convention, cov, and stamp', () => {
        const r = framedPoseSchema.parse({
            pose: { t: [1, 2, 3], q: [0, 0, 0, 1] },
            frame_ref: { uuid: 'u', fqn: 'f:u', coord_convention: 'GRAPHICS' },
            cov: { type: 'COV_POS3', pos: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
            stamp: { sec: 1714071000, nanosec: 0 },
        });
        assert.equal(r.frame_ref.coord_convention, 'GRAPHICS');
        assert.equal(r.cov?.type, 'COV_POS3');
        assert.equal(r.stamp?.sec, 1714071000);
    });

    it('keeps APPENDABLE extra fields on framedPose', () => {
        const r = framedPoseSchema.parse({
            pose: { t: [0, 0, 0], q: [0, 0, 0, 1], extra_pose_key: true },
            frame_ref: { uuid: 'u', fqn: 'f:u', extra_frame_key: 'x' },
            future_field: 'spatialdds-1.8',
        });
        assert.equal((r as { future_field?: string }).future_field, 'spatialdds-1.8');
        assert.equal((r.pose as { extra_pose_key?: boolean }).extra_pose_key, true);
        assert.equal((r.frame_ref as { extra_frame_key?: string }).extra_frame_key, 'x');
    });

    it('rejects incomplete framedPose (missing pose)', () => {
        assert.throws(() => {
            contentSchema.parse({
                id: 'c',
                type: '3D',
                title: 't',
                framedPose: {
                    frame_ref: { uuid: 'u', fqn: 'f:u' },
                },
            });
        });
    });

    it('accepts omitted or empty definitions', () => {
        assert.doesNotThrow(() => contentSchema.parse(minimalGeo));
        const withEmpty = contentSchema.parse({ ...minimalGeo, definitions: [] });
        assert.deepEqual(withEmpty.definitions, []);
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
                    pose: { t: [1, 2, 3], q: [0, 0, 0, 1] },
                    frame_ref: { uuid: 'a', fqn: 'b' },
                },
            },
        });
        assert.ok(scr.content.framedPose);
    });
});

describe('JSON fixtures and scr.schema.json', () => {
    it('parses the empty SCR template', () => {
        const parsed = scrNoIdSchema.parse(emptyScr);
        assert.ok(parsed.content.geopose);
        assert.strictEqual(parsed.content.framedPose, undefined);
    });

    it('parses the geopose sample SCR', () => {
        scrNoIdSchema.parse(geoSample);
    });

    it('parses the framedPose sample SCR', () => {
        const parsed = scrNoIdSchema.parse(framedSample);
        assert.ok(parsed.content.framedPose);
        assert.strictEqual(parsed.content.geopose, undefined);
        assert.equal(parsed.content.framedPose?.frame_ref.coord_convention, 'ENU');
    });

    it('requires at least one of geopose or framedPose in JSON Schema', () => {
        const content = scrJsonSchema.properties.content;
        assert.ok(content.properties.framedPose);
        assert.ok(content.properties.geopose);
        assert.ok(!content.required.includes('geopose'));
        assert.ok(!content.required.includes('framedPose'));
        assert.deepEqual(content.anyOf, [{ required: ['geopose'] }, { required: ['framedPose'] }]);
    });
});
