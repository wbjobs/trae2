import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Trace, { ITrace, TraceType } from './trace.model';
import Fossil from '../fossil/fossil.model';
import { AuthRequest } from '../auth/auth.middleware';
import { AppError } from '../middleware/error.middleware';

export const createTrace = async (
  fossilId: string,
  specimenNo: string,
  type: TraceType,
  title: string,
  operatorId: string,
  operatorName: string,
  options: Partial<ITrace> = {}
) => {
  await Trace.create({
    fossilId,
    specimenNo,
    type,
    title,
    operator: operatorId,
    operatorName,
    ...options
  });
};

export const addTraceRecord = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { fossilId, type, title, description, fromLocation, toLocation, fromStatus, toStatus, metadata } = req.body;

  if (!fossilId || !type || !title) {
    return next(new AppError('缺少必要参数', 400));
  }

  const fossil = await Fossil.findById(fossilId);
  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  const trace = await Trace.create({
    fossilId,
    specimenNo: fossil.specimenNo,
    type,
    title,
    description,
    operator: req.user._id,
    operatorName: req.user.realName,
    fromLocation,
    toLocation,
    fromStatus,
    toStatus,
    metadata
  });

  res.status(201).json({
    status: 'success',
    data: {
      trace
    }
  });
};

export const getFossilTraces = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { fossilId } = req.params;
  const { page = 1, limit = 50, type, sort = 'desc' } = req.query;

  const filter: any = { fossilId };
  if (type && type !== 'all') {
    filter.type = type;
  }

  const sortOrder = sort === 'asc' ? 1 : -1;

  const traces = await Trace.find(filter)
    .sort({ timestamp: sortOrder, createdAt: sortOrder })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('operator', 'realName username role');

  const total = await Trace.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: traces.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      traces
    }
  });
};

export const getTraceBySpecimenNo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { specimenNo } = req.params;
  const { page = 1, limit = 50, type, sort = 'desc' } = req.query;

  const filter: any = { specimenNo };
  if (type && type !== 'all') {
    filter.type = type;
  }

  const sortOrder = sort === 'asc' ? 1 : -1;

  const traces = await Trace.find(filter)
    .sort({ timestamp: sortOrder, createdAt: sortOrder })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('operator', 'realName username role');

  const total = await Trace.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: traces.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      traces
    }
  });
};

export const getAllTraces = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const {
    page = 1,
    limit = 20,
    type,
    operator,
    startDate,
    endDate,
    sortBy = 'timestamp',
    sortOrder = 'desc'
  } = req.query;

  const filter: any = {};

  if (type && type !== 'all') {
    filter.type = type;
  }

  if (operator) {
    filter.operator = operator;
  }

  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) {
      filter.timestamp.$gte = new Date(startDate as string);
    }
    if (endDate) {
      filter.timestamp.$lte = new Date(endDate as string);
    }
  }

  const sort: any = {};
  sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

  const traces = await Trace.find(filter)
    .sort(sort)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('operator', 'realName username role');

  const total = await Trace.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: traces.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      traces
    }
  });
};

export const getTraceStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { fossilId } = req.params;

  const typeStats = await Trace.aggregate([
    { $match: { fossilId: new mongoose.Types.ObjectId(fossilId) } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  const locationChanges = await Trace.aggregate([
    { $match: { fossilId: new mongoose.Types.ObjectId(fossilId), type: 'location_change' } },
    { $sort: { timestamp: 1 } }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      typeStats,
      locationChanges
    }
  });
};

export const getTrace = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const trace = await Trace.findById(id)
    .populate('operator', 'realName username role');

  if (!trace) {
    return next(new AppError('溯源记录不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      trace
    }
  });
};
