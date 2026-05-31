import { Router, type Request, type Response } from 'express';
import { annotationStore } from '../data/mockData.js';
import type { Annotation } from '../../src/types/index.js';
import { randomUUID } from 'crypto';

const router = Router();

router.get('/', (req: Request, res: Response): void => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 50;
  const type = (req.query.type as string) || '';

  let annotations = Array.from(annotationStore.values());

  if (type) {
    annotations = annotations.filter((a) => a.type === type);
  }

  const total = annotations.length;
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const paginatedData = annotations.slice(skip, skip + take);

  res.json({
    success: true,
    data: paginatedData,
    total,
    page,
    pageSize,
    totalPages,
  });
});

router.get('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const annotation = annotationStore.get(id);

  if (!annotation) {
    res.status(404).json({
      success: false,
      error: 'Annotation not found'
    });
    return;
  }

  res.json({
    success: true,
    data: annotation
  });
});

router.post('/', (req: Request, res: Response): void => {
  const { type, name, description, position, color } = req.body;

  if (!name || !position) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: name, position'
    });
    return;
  }

  if (!Array.isArray(position) || position.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Position must be an array with at least 2 coordinates'
    });
    return;
  }

  const id = `anno-${randomUUID().slice(0, 8)}`;

  const newAnnotation: Annotation = {
    id,
    type: (type as Annotation['type']) || 'label',
    name,
    description: description || '',
    position: position as [number, number, number],
    color: color || '#e87c3e',
    createdAt: new Date().toISOString()
  };

  annotationStore.set(id, newAnnotation);

  res.status(201).json({
    success: true,
    data: newAnnotation,
    message: 'Annotation created successfully'
  });
});

router.put('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const existingAnnotation = annotationStore.get(id);

  if (!existingAnnotation) {
    res.status(404).json({
      success: false,
      error: 'Annotation not found'
    });
    return;
  }

  const { type, name, description, position, color } = req.body;

  const updatedAnnotation: Annotation = {
    ...existingAnnotation,
    type: (type as Annotation['type']) ?? existingAnnotation.type,
    name: name ?? existingAnnotation.name,
    description: description ?? existingAnnotation.description,
    position: (position as [number, number, number]) ?? existingAnnotation.position,
    color: color ?? existingAnnotation.color
  };

  annotationStore.set(id, updatedAnnotation);

  res.json({
    success: true,
    data: updatedAnnotation,
    message: 'Annotation updated successfully'
  });
});

router.delete('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const deleted = annotationStore.delete(id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'Annotation not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Annotation deleted successfully'
  });
});

export default router;
