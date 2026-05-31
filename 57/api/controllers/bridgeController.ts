import { Request, Response } from 'express';
import * as bridgeService from '../services/bridgeService.js';

export async function getBridges(req: Request, res: Response) {
  try {
    const bridges = bridgeService.getAllBridges();
    res.json(bridges);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bridges' });
  }
}

export async function getBridge(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const bridge = bridgeService.getBridgeById(id);
    if (!bridge) {
      return res.status(404).json({ error: 'Bridge not found' });
    }
    res.json(bridge);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bridge' });
  }
}

export async function getDefects(req: Request, res: Response) {
  try {
    const { bridgeId } = req.params;
    const defects = bridgeService.getDefectsByBridgeId(bridgeId);
    res.json(defects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch defects' });
  }
}

export async function createDefect(req: Request, res: Response) {
  try {
    const defect = bridgeService.createDefect(req.body);
    res.status(201).json(defect);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create defect' });
  }
}

export async function updateDefect(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const defect = bridgeService.updateDefect(id, req.body);
    if (!defect) {
      return res.status(404).json({ error: 'Defect not found' });
    }
    res.json(defect);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update defect' });
  }
}

export async function deleteDefect(req: Request, res: Response) {
  try {
    const { id } = req.params;
    bridgeService.deleteDefect(id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete defect' });
  }
}

export async function getLayers(req: Request, res: Response) {
  try {
    const { bridgeId } = req.params;
    const layers = bridgeService.getLayersByBridgeId(bridgeId);
    res.json(layers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch layers' });
  }
}

export async function createLayer(req: Request, res: Response) {
  try {
    const layer = bridgeService.createLayer(req.body);
    res.status(201).json(layer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create layer' });
  }
}

export async function updateLayer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const layer = bridgeService.updateLayer(id, req.body);
    if (!layer) {
      return res.status(404).json({ error: 'Layer not found' });
    }
    res.json(layer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update layer' });
  }
}

export async function getStressResults(req: Request, res: Response) {
  try {
    const { bridgeId } = req.params;
    const stress = bridgeService.getStressByBridgeId(bridgeId);
    res.json(stress);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stress results' });
  }
}
