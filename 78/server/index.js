const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/pipelines', (req, res) => {
    const { type, section } = req.query;
    let pipelines = db.getPipelines();
    if (type) pipelines = pipelines.filter(p => p.type === type);
    if (section) pipelines = pipelines.filter(p => p.section === section);
    res.json({ success: true, data: pipelines });
});

app.get('/api/pipelines/:id', (req, res) => {
    const pipeline = db.getPipelineById(req.params.id);
    if (!pipeline) return res.status(404).json({ success: false, message: '管线未找到' });
    res.json({ success: true, data: pipeline });
});

app.post('/api/pipelines', (req, res) => {
    const pipeline = db.createPipeline(req.body);
    res.json({ success: true, data: pipeline });
});

app.put('/api/pipelines/:id', (req, res) => {
    const pipeline = db.updatePipeline(req.params.id, req.body);
    if (!pipeline) return res.status(404).json({ success: false, message: '管线未找到' });
    res.json({ success: true, data: pipeline });
});

app.delete('/api/pipelines/:id', (req, res) => {
    const ok = db.deletePipeline(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: '管线未找到' });
    res.json({ success: true });
});

app.post('/api/collision/detect', (req, res) => {
    const { pipelineIds, tolerance } = req.body;
    const pipelines = pipelineIds
        ? pipelineIds.map(id => db.getPipelineById(id)).filter(Boolean)
        : db.getPipelines();
    const collisions = detectCollisions(pipelines, tolerance || 0.1);
    res.json({ success: true, data: collisions });
});

app.get('/api/sections', (req, res) => {
    res.json({ success: true, data: db.getSections() });
});

app.get('/api/stats', (req, res) => {
    const pipelines = db.getPipelines();
    const typeCount = {};
    pipelines.forEach(p => { typeCount[p.type] = (typeCount[p.type] || 0) + 1; });
    res.json({
        success: true,
        data: {
            totalPipelines: pipelines.length,
            typeCount,
            totalLength: pipelines.reduce((s, p) => s + (p.length || 0), 0)
        }
    });
});

function detectCollisions(pipelines, tolerance) {
    const collisions = [];
    const collisionMap = new Set();

    for (let i = 0; i < pipelines.length; i++) {
        for (let j = i + 1; j < pipelines.length; j++) {
            const pA = pipelines[i];
            const pB = pipelines[j];

            const pairKey = [pA.id, pB.id].sort().join('|');
            if (collisionMap.has(pairKey)) continue;

            const quickCheck = quickBroadphaseCheck(pA, pB, tolerance);
            if (!quickCheck) continue;

            const segmentResults = detectSegmentCollisions(pA, pB, tolerance);
            const capsuleResult = detectCapsuleCollision(pA, pB, tolerance);
            const endpointResults = detectEndpointCollisions(pA, pB, tolerance);
            const gjkResult = detectGJKCollision(pA, pB, tolerance);

            const allResults = [...segmentResults, capsuleResult, ...endpointResults, gjkResult].filter(Boolean);

            if (allResults.length > 0) {
                const bestResult = allResults.reduce((best, curr) =>
                    curr.distance < best.distance ? curr : best
                );
                collisionMap.add(pairKey);
                collisions.push(bestResult);
            }
        }
    }

    return collisions.sort((a, b) => a.distance - b.distance);
}

function quickBroadphaseCheck(pA, pB, tolerance) {
    const aMin = {
        x: Math.min(pA.startX, pA.endX) - pA.radius - tolerance,
        y: Math.min(pA.startY, pA.endY) - pA.radius - tolerance,
        z: Math.min(pA.startZ, pA.endZ) - pA.radius - tolerance
    };
    const aMax = {
        x: Math.max(pA.startX, pA.endX) + pA.radius + tolerance,
        y: Math.max(pA.startY, pA.endY) + pA.radius + tolerance,
        z: Math.max(pA.startZ, pA.endZ) + pA.radius + tolerance
    };
    const bMin = {
        x: Math.min(pB.startX, pB.endX) - pB.radius - tolerance,
        y: Math.min(pB.startY, pB.endY) - pB.radius - tolerance,
        z: Math.min(pB.startZ, pB.endZ) - pB.radius - tolerance
    };
    const bMax = {
        x: Math.max(pB.startX, pB.endX) + pB.radius + tolerance,
        y: Math.max(pB.startY, pB.endY) + pB.radius + tolerance,
        z: Math.max(pB.startZ, pB.endZ) + pB.radius + tolerance
    };

    return (aMin.x <= bMax.x && aMax.x >= bMin.x) &&
           (aMin.y <= bMax.y && aMax.y >= bMin.y) &&
           (aMin.z <= bMax.z && aMax.z >= bMin.z);
}

function detectSegmentCollisions(pA, pB, tolerance) {
    const results = [];
    const a1 = { x: pA.startX, y: pA.startY, z: pA.startZ };
    const a2 = { x: pA.endX, y: pA.endY, z: pA.endZ };
    const b1 = { x: pB.startX, y: pB.startY, z: pB.startZ };
    const b2 = { x: pB.endX, y: pB.endY, z: pB.endZ };

    const lenA = length(sub(a2, a1));
    const lenB = length(sub(b2, b1));

    const segmentsA = Math.max(1, Math.ceil(lenA / 5));
    const segmentsB = Math.max(1, Math.ceil(lenB / 5));

    for (let i = 0; i < segmentsA; i++) {
        const tA0 = i / segmentsA;
        const tA1 = (i + 1) / segmentsA;
        const segA0 = add(a1, scale(sub(a2, a1), tA0));
        const segA1 = add(a1, scale(sub(a2, a1), tA1));

        for (let j = 0; j < segmentsB; j++) {
            const tB0 = j / segmentsB;
            const tB1 = (j + 1) / segmentsB;
            const segB0 = add(b1, scale(sub(b2, b1), tB0));
            const segB1 = add(b1, scale(sub(b2, b1), tB1));

            const result = computePreciseSegmentCollision(
                pA, pB, segA0, segA1, segB0, segB1, tolerance
            );
            if (result) results.push(result);
        }
    }

    return results;
}

function computePreciseSegmentCollision(pA, pB, segA0, segA1, segB0, segB1, tolerance) {
    const rA = pA.radius || 0.05;
    const rB = pB.radius || 0.05;

    const da = sub(segA1, segA0);
    const db2 = sub(segB1, segB0);
    const dc = sub(segA0, segB0);
    const dd = dot(da, da);
    const ee = dot(db2, db2);
    const ff = dot(da, db2);

    let s, t;
    const denom = dd * ee - ff * ff;

    if (Math.abs(denom) > 1e-12) {
        s = clamp((ff * dot(dc, db2) - ee * dot(dc, da)) / denom, 0, 1);
        t = clamp((dd * dot(dc, db2) - ff * dot(dc, da)) / denom, 0, 1);
    } else {
        s = 0; t = 0;
    }

    const ptA = add(segA0, scale(da, s));
    const ptB = add(segB0, scale(db2, t));
    const dist = length(sub(ptA, ptB));
    const minDist = rA + rB + tolerance;

    if (dist < minDist) {
        const mid = scale(add(ptA, ptB), 0.5);
        return {
            pipelineA: { id: pA.id, name: pA.name, type: pA.type },
            pipelineB: { id: pB.id, name: pB.name, type: pB.type },
            collisionPoint: mid,
            distance: dist,
            minDistance: minDist,
            severity: dist < rA + rB ? 'hard' : 'soft',
            detectionMethod: 'segment',
            closestPoints: { pointA: ptA, pointB: ptB }
        };
    }
    return null;
}

function detectCapsuleCollision(pA, pB, tolerance) {
    const a1 = { x: pA.startX, y: pA.startY, z: pA.startZ };
    const a2 = { x: pA.endX, y: pA.endY, z: pA.endZ };
    const b1 = { x: pB.startX, y: pB.startY, z: pB.startZ };
    const b2 = { x: pB.endX, y: pB.endY, z: pB.endZ };
    const rA = pA.radius || 0.05;
    const rB = pB.radius || 0.05;

    const numSamples = 30;
    let minDistance = Infinity;
    let bestPointA = null;
    let bestPointB = null;

    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const ptA = add(a1, scale(sub(a2, a1), t));

        for (let j = 0; j <= numSamples; j++) {
            const s = j / numSamples;
            const ptB = add(b1, scale(sub(b2, b1), s));

            const dist = length(sub(ptA, ptB));
            if (dist < minDistance) {
                minDistance = dist;
                bestPointA = ptA;
                bestPointB = ptB;
            }
        }
    }

    const minDist = rA + rB + tolerance;
    if (minDistance < minDist) {
        const mid = scale(add(bestPointA, bestPointB), 0.5);
        return {
            pipelineA: { id: pA.id, name: pA.name, type: pA.type },
            pipelineB: { id: pB.id, name: pB.name, type: pB.type },
            collisionPoint: mid,
            distance: minDistance,
            minDistance: minDist,
            severity: minDistance < rA + rB ? 'hard' : 'soft',
            detectionMethod: 'capsule_sampling',
            closestPoints: { pointA: bestPointA, pointB: bestPointB }
        };
    }
    return null;
}

function detectEndpointCollisions(pA, pB, tolerance) {
    const results = [];
    const rA = pA.radius || 0.05;
    const rB = pB.radius || 0.05;

    const endpointsA = [
        { x: pA.startX, y: pA.startY, z: pA.startZ },
        { x: pA.endX, y: pA.endY, z: pA.endZ }
    ];
    const endpointsB = [
        { x: pB.startX, y: pB.startY, z: pB.startZ },
        { x: pB.endX, y: pB.endY, z: pB.endZ }
    ];

    endpointsA.forEach((epA, iA) => {
        endpointsB.forEach((epB, iB) => {
            const dist = length(sub(epA, epB));
            const minDist = rA + rB + tolerance;

            if (dist < minDist) {
                const mid = scale(add(epA, epB), 0.5);
                results.push({
                    pipelineA: { id: pA.id, name: pA.name, type: pA.type },
                    pipelineB: { id: pB.id, name: pB.name, type: pB.type },
                    collisionPoint: mid,
                    distance: dist,
                    minDistance: minDist,
                    severity: dist < rA + rB ? 'hard' : 'soft',
                    detectionMethod: 'endpoint',
                    endpointIndices: [iA, iB]
                });
            }
        });

        const lineResult = checkPointToLineDistance(epA, pB, tolerance);
        if (lineResult) {
            results.push({
                pipelineA: { id: pA.id, name: pA.name, type: pA.type },
                pipelineB: { id: pB.id, name: pB.name, type: pB.type },
                collisionPoint: lineResult.point,
                distance: lineResult.distance,
                minDistance: lineResult.minDistance,
                severity: lineResult.severity,
                detectionMethod: 'endpoint_to_line'
            });
        }
    });

    endpointsB.forEach(epB => {
        const lineResult = checkPointToLineDistance(epB, pA, tolerance);
        if (lineResult) {
            results.push({
                pipelineA: { id: pA.id, name: pA.name, type: pA.type },
                pipelineB: { id: pB.id, name: pB.name, type: pB.type },
                collisionPoint: lineResult.point,
                distance: lineResult.distance,
                minDistance: lineResult.minDistance,
                severity: lineResult.severity,
                detectionMethod: 'endpoint_to_line'
            });
        }
    });

    return results;
}

function checkPointToLineDistance(point, pipeline, tolerance) {
    const rA = pipeline.radius || 0.05;
    const rB = 0.05;
    const b1 = { x: pipeline.startX, y: pipeline.startY, z: pipeline.startZ };
    const b2 = { x: pipeline.endX, y: pipeline.endY, z: pipeline.endZ };

    const lv = sub(b2, b1);
    const pv = sub(point, b1);
    const l2 = dot(lv, lv);
    let t = clamp(dot(pv, lv) / l2, 0, 1);

    const proj = add(b1, scale(lv, t));
    const dist = length(sub(point, proj));
    const minDist = rA + rB + tolerance;

    if (dist < minDist) {
        const mid = scale(add(point, proj), 0.5);
        return {
            point: mid,
            distance: dist,
            minDistance: minDist,
            severity: dist < rA + rB ? 'hard' : 'soft'
        };
    }
    return null;
}

function detectGJKCollision(pA, pB, tolerance) {
    const simplex = [];
    let dir = { x: 1, y: 0, z: 0 };

    const supA = support(pA, dir);
    const supB = support(pB, negate(dir));
    const initial = sub(supA, supB);
    simplex.push(initial);
    dir = negate(initial);

    for (let i = 0; i < 32; i++) {
        const supportPoint = support(pA, dir);
        const supportPointB = support(pB, negate(dir));
        const ab = sub(supportPoint, supportPointB);

        if (dot(ab, dir) <= 1e-8) {
            break;
        }

        simplex.push(ab);

        if (gjkSimplex(simplex, dir)) {
            const epaResult = epa(simplex, pA, pB);
            if (epaResult && epaResult.distance < (pA.radius + pB.radius + tolerance)) {
                return {
                    pipelineA: { id: pA.id, name: pA.name, type: pA.type },
                    pipelineB: { id: pB.id, name: pB.name, type: pB.type },
                    collisionPoint: epaResult.point,
                    distance: epaResult.distance,
                    minDistance: pA.radius + pB.radius + tolerance,
                    severity: epaResult.distance < pA.radius + pB.radius ? 'hard' : 'soft',
                    detectionMethod: 'gjk_epa'
                };
            }
            break;
        }
    }
    return null;
}

function support(pipeline, dir) {
    const a1 = { x: pipeline.startX, y: pipeline.startY, z: pipeline.startZ };
    const a2 = { x: pipeline.endX, y: pipeline.endY, z: pipeline.endZ };
    const r = pipeline.radius || 0.05;

    const d1 = dot(a1, dir);
    const d2 = dot(a2, dir);

    const endpoint = d1 > d2 ? a1 : a2;
    const dirNorm = normalize(dir);

    return {
        x: endpoint.x + dirNorm.x * r,
        y: endpoint.y + dirNorm.y * r,
        z: endpoint.z + dirNorm.z * r
    };
}

function gjkSimplex(simplex, dir) {
    if (simplex.length === 2) return lineSimplex(simplex, dir);
    if (simplex.length === 3) return triangleSimplex(simplex, dir);
    if (simplex.length === 4) return tetrahedronSimplex(simplex, dir);
    return false;
}

function lineSimplex(simplex, dir) {
    const a = simplex[1];
    const b = simplex[0];
    const ab = sub(b, a);
    const ao = negate(a);
    const abperp = tripleProduct(ab, ao, ab);
    dir.x = abperp.x; dir.y = abperp.y; dir.z = abperp.z;
    return false;
}

function triangleSimplex(simplex, dir) {
    const a = simplex[2];
    const b = simplex[1];
    const c = simplex[0];
    const ab = sub(b, a);
    const ac = sub(c, a);
    const ao = negate(a);
    const abc = cross(ab, ac);
    const acperp = tripleProduct(ab, abc, ab);

    if (dot(acperp, ao) > 0) {
        simplex.splice(0, 1);
        dir.x = acperp.x; dir.y = acperp.y; dir.z = acperp.z;
        return false;
    }

    const abperp = tripleProduct(abc, ab, ab);
    if (dot(abperp, ao) > 0) {
        simplex.splice(1, 1);
        dir.x = abperp.x; dir.y = abperp.y; dir.z = abperp.z;
        return false;
    }

    if (dot(abc, ao) > 0) {
        dir.x = abc.x; dir.y = abc.y; dir.z = abc.z;
        return false;
    }

    const negAbc = negate(abc);
    dir.x = negAbc.x; dir.y = negAbc.y; dir.z = negAbc.z;
    simplex.reverse();
    return false;
}

function tetrahedronSimplex(simplex, dir) {
    const a = simplex[3];
    const b = simplex[2];
    const c = simplex[1];
    const d = simplex[0];
    const ao = negate(a);
    const ab = sub(b, a);
    const ac = sub(c, a);
    const ad = sub(d, a);
    const abc = cross(ab, ac);
    const acd = cross(ac, ad);
    const adb = cross(ad, ab);

    if (dot(abc, ao) > 0) {
        simplex.splice(0, 1);
        dir.x = abc.x; dir.y = abc.y; dir.z = abc.z;
        return false;
    }
    if (dot(acd, ao) > 0) {
        simplex.splice(1, 1);
        dir.x = acd.x; dir.y = acd.y; dir.z = acd.z;
        return false;
    }
    if (dot(adb, ao) > 0) {
        simplex.splice(2, 1);
        dir.x = adb.x; dir.y = adb.y; dir.z = adb.z;
        return false;
    }

    return true;
}

function epa(simplex, pA, pB) {
    const faces = [
        [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]
    ];

    const polytope = [...simplex];
    let minDistance = Infinity;
    let minNormal = null;
    let minFace = null;

    for (let iter = 0; iter < 64; iter++) {
        let closestDist = Infinity;
        let closestNormal = null;
        let closestFace = null;
        let closestFaceIndex = -1;

        for (let i = 0; i < faces.length; i++) {
            const face = faces[i];
            const a = polytope[face[0]];
            const b = polytope[face[1]];
            const c = polytope[face[2]];

            const n = normalize(cross(sub(b, a), sub(c, a)));
            const d = dot(n, a);

            if (d < closestDist) {
                closestDist = d;
                closestNormal = n;
                closestFace = face;
                closestFaceIndex = i;
            }
        }

        const supA = support(pA, closestNormal);
        const supB = support(pB, negate(closestNormal));
        const w = sub(supA, supB);
        const wDistance = dot(closestNormal, w);

        if (Math.abs(wDistance - closestDist) < 1e-4 || closestDist < minDistance) {
            minDistance = closestDist;
            minNormal = closestNormal;
            minFace = closestFace;
            break;
        }

        polytope.push(w);

        const newFaces = [];
        faces.forEach((face, idx) => {
            if (idx === closestFaceIndex) {
                newFaces.push([face[0], face[1], polytope.length - 1]);
                newFaces.push([face[1], face[2], polytope.length - 1]);
                newFaces.push([face[2], face[0], polytope.length - 1]);
            } else {
                newFaces.push(face);
            }
        });

        faces.length = 0;
        faces.push(...newFaces);
        minDistance = wDistance;
        minNormal = closestNormal;
    }

    const midPoint = {
        x: (pA.startX + pA.endX + pB.startX + pB.endX) / 4,
        y: (pA.startY + pA.endY + pB.startY + pB.endY) / 4,
        z: (pA.startZ + pA.endZ + pB.startZ + pB.endZ) / 4
    };

    return { distance: minDistance, point: midPoint, normal: minNormal };
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function normalize(a) {
    const len = length(a);
    if (len < 1e-8) return { x: 0, y: 0, z: 0 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}

function negate(a) {
    return { x: -a.x, y: -a.y, z: -a.z };
}

function tripleProduct(a, b, c) {
    const bc = cross(b, c);
    return cross(a, bc);
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

app.listen(PORT, () => {
    console.log(`综合管廊碰撞检测平台服务已启动: http://localhost:${PORT}`);
});
