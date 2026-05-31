const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pipeline-data.json');

const defaultSections = [
    { id: 'S001', name: 'A1区段', length: 120, width: 3.5, height: 3.0, description: 'A1标段综合管廊' },
    { id: 'S002', name: 'A2区段', length: 95, width: 3.5, height: 3.0, description: 'A2标段综合管廊' },
    { id: 'S003', name: 'B1区段', length: 150, width: 4.0, height: 3.5, description: 'B1标段综合管廊（双仓）' },
    { id: 'S004', name: 'B2区段', length: 80, width: 4.0, height: 3.5, description: 'B2标段综合管廊' }
];

const defaultPipelines = [
    { id: 'V001', name: '送风管-1', type: 'ventilation', section: 'S001', startX: 0, startY: 2.5, startZ: 0, endX: 120, endY: 2.5, endZ: 0, radius: 0.3, length: 120, material: '镀锌钢板', pressure: 500, temperature: 25, status: 'active' },
    { id: 'V002', name: '排风管-1', type: 'ventilation', section: 'S001', startX: 0, startY: 2.5, startZ: -1.0, endX: 120, endY: 2.5, endZ: -1.0, radius: 0.25, length: 120, material: '镀锌钢板', pressure: -200, temperature: 30, status: 'active' },
    { id: 'V003', name: '送风管-2', type: 'ventilation', section: 'S002', startX: 0, startY: 2.3, startZ: 0.5, endX: 95, endY: 2.3, endZ: 0.5, radius: 0.28, length: 95, material: '镀锌钢板', pressure: 500, temperature: 25, status: 'active' },
    { id: 'F001', name: '消防水管-1', type: 'fire_water', section: 'S001', startX: 0, startY: 1.2, startZ: 1.2, endX: 120, endY: 1.2, endZ: 1.2, radius: 0.08, length: 120, material: '无缝钢管', pressure: 800, temperature: 20, status: 'active' },
    { id: 'F002', name: '消防水管-2', type: 'fire_water', section: 'S001', startX: 0, startY: 1.2, startZ: -1.2, endX: 120, endY: 1.2, endZ: -1.2, radius: 0.065, length: 120, material: '无缝钢管', pressure: 800, temperature: 20, status: 'active' },
    { id: 'F003', name: '喷淋管-1', type: 'fire_sprinkler', section: 'S001', startX: 5, startY: 2.7, startZ: 0, endX: 115, endY: 2.7, endZ: 0, radius: 0.025, length: 110, material: '镀锌钢管', pressure: 600, temperature: 20, status: 'active' },
    { id: 'F004', name: '消防水管-3', type: 'fire_water', section: 'S002', startX: 0, startY: 1.0, startZ: 1.0, endX: 95, endY: 1.0, endZ: 1.0, radius: 0.08, length: 95, material: '无缝钢管', pressure: 800, temperature: 20, status: 'active' },
    { id: 'E001', name: '电力电缆-1', type: 'electrical', section: 'S001', startX: 0, startY: 0.5, startZ: 1.4, endX: 120, endY: 0.5, endZ: 1.4, radius: 0.04, length: 120, material: '电缆桥架', pressure: 0, temperature: 35, status: 'active' },
    { id: 'E002', name: '电力电缆-2', type: 'electrical', section: 'S002', startX: 0, startY: 0.5, startZ: 1.3, endX: 95, endY: 0.5, endZ: 1.3, radius: 0.04, length: 95, material: '电缆桥架', pressure: 0, temperature: 35, status: 'active' },
    { id: 'C001', name: '通信光缆-1', type: 'communication', section: 'S001', startX: 0, startY: 0.5, startZ: -1.4, endX: 120, endY: 0.5, endZ: -1.4, radius: 0.03, length: 120, material: '光缆桥架', pressure: 0, temperature: 25, status: 'active' },
    { id: 'W001', name: '给水管-1', type: 'water_supply', section: 'S003', startX: 0, startY: 1.0, startZ: 1.5, endX: 150, endY: 1.0, endZ: 1.5, radius: 0.15, length: 150, material: '球墨铸铁管', pressure: 400, temperature: 20, status: 'active' },
    { id: 'D001', name: '排水管-1', type: 'drainage', section: 'S003', startX: 0, startY: 0.3, startZ: 0, endX: 150, endY: 0.3, endZ: 0, radius: 0.2, length: 150, material: 'HDPE管', pressure: 0, temperature: 20, status: 'active' },
    { id: 'G001', name: '燃气管-1', type: 'gas', section: 'S004', startX: 0, startY: 1.8, startZ: 1.5, endX: 80, endY: 1.8, endZ: 1.5, radius: 0.1, length: 80, material: 'PE管', pressure: 300, temperature: 20, status: 'active' },
    { id: 'V004', name: '送风管-3', type: 'ventilation', section: 'S003', startX: 0, startY: 2.8, startZ: 0, endX: 150, endY: 2.8, endZ: 0, radius: 0.35, length: 150, material: '镀锌钢板', pressure: 500, temperature: 25, status: 'active' },
    { id: 'F005', name: '消防水管-4', type: 'fire_water', section: 'S003', startX: 0, startY: 1.5, startZ: -1.0, endX: 150, endY: 1.5, endZ: -1.0, radius: 0.08, length: 150, material: '无缝钢管', pressure: 800, temperature: 20, status: 'active' },
    { id: 'V005', name: '排烟管-1', type: 'smoke_exhaust', section: 'S001', startX: 10, startY: 2.4, startZ: 0.6, endX: 110, endY: 2.4, endZ: 0.6, radius: 0.2, length: 100, material: '耐火风管', pressure: -300, temperature: 280, status: 'active' }
];

function loadData() {
    if (!fs.existsSync(DB_PATH)) {
        const data = { sections: defaultSections, pipelines: defaultPipelines };
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        const data = { sections: defaultSections, pipelines: defaultPipelines };
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    }
}

function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function getPipelines() {
    return loadData().pipelines;
}

function getPipelineById(id) {
    return loadData().pipelines.find(p => p.id === id) || null;
}

function createPipeline(data) {
    const store = loadData();
    const id = 'P' + Date.now().toString(36).toUpperCase();
    const pipeline = { id, ...data };
    store.pipelines.push(pipeline);
    saveData(store);
    return pipeline;
}

function updatePipeline(id, data) {
    const store = loadData();
    const idx = store.pipelines.findIndex(p => p.id === id);
    if (idx === -1) return null;
    store.pipelines[idx] = { ...store.pipelines[idx], ...data, id };
    saveData(store);
    return store.pipelines[idx];
}

function deletePipeline(id) {
    const store = loadData();
    const idx = store.pipelines.findIndex(p => p.id === id);
    if (idx === -1) return false;
    store.pipelines.splice(idx, 1);
    saveData(store);
    return true;
}

function getSections() {
    return loadData().sections;
}

module.exports = { getPipelines, getPipelineById, createPipeline, updatePipeline, deletePipeline, getSections };
