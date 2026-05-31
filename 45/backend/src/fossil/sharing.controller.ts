import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Sharing from './sharing.model';
import Fossil from './fossil.model';
import Museum from './museum.model';
import { AuthRequest } from '../auth/auth.middleware';
import { AppError } from '../middleware/error.middleware';

export const createSharing = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { fossilId, toMuseumId, toMuseumCode, toEmail, permission, expiresAt, password, description } = req.body;

  if (!fossilId) {
    return next(new AppError('请选择要共享的标本', 400));
  }

  const fossil = await Fossil.findById(fossilId);
  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  let museum = null;
  if (toMuseumCode) {
    museum = await Museum.findOne({ code: toMuseumCode });
    if (!museum && toMuseumCode) {
      museum = await Museum.create({
        name: toMuseumCode,
        code: toMuseumCode.toUpperCase()
      });
    }
  } else if (toMuseumId) {
    museum = await Museum.findById(toMuseumId);
  }

  const sharing = await Sharing.create({
    fossilId,
    specimenNo: fossil.specimenNo,
    fromMuseumId: (fossil as any).museumId || req.user._id,
    toMuseumId: museum?._id,
    toMuseumCode: museum?.code || toMuseumCode,
    toEmail,
    permission: permission || 'view',
    expiresAt,
    createdBy: req.user._id,
    password,
    description
  });

  await Fossil.findByIdAndUpdate(fossilId, {
    isShared: true,
    shareLevel: 'internal'
  });

  res.status(201).json({
    status: 'success',
    data: {
      sharing
    }
  });
};

export const getSharings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const {
    page = 1,
    limit = 20,
    fossilId,
    status,
    type
  } = req.query;

  const filter: any = {};

  if (fossilId) {
    filter.fossilId = fossilId;
  }

  if (status) {
    filter.status = status;
  }

  if (type === 'incoming') {
    if (req.user) {
      filter.$or = [
        { toEmail: (req.user as any).email },
        { toMuseumId: (req.user as any).museumId }
      ];
    }
  } else if (type === 'outgoing') {
    if (req.user) {
      filter.createdBy = req.user._id;
    }
  }

  const sharings = await Sharing.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('fossilId', 'name specimenNo category')
    .populate('fromMuseumId', 'name code')
    .populate('toMuseumId', 'name code')
    .populate('createdBy', 'realName username');

  const total = await Sharing.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: sharings.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      sharings
    }
  });
};

export const getSharingByCode = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { shareCode } = req.params;
  const { password } = req.body;

  const sharing = await Sharing.findOne({ shareCode, status: 'active' })
    .populate('fossilId')
    .populate('fromMuseumId', 'name code');

  if (!sharing) {
    return next(new AppError('共享链接无效或已过期', 404));
  }

  if (sharing.expiresAt && new Date(sharing.expiresAt) < new Date()) {
    await Sharing.findByIdAndUpdate(sharing._id, { status: 'expired' });
    return next(new AppError('共享链接已过期', 410));
  }

  if (sharing.password && password !== sharing.password) {
    return next(new AppError('密码错误', 401));
  }

  await Sharing.findByIdAndUpdate(sharing._id, {
    $inc: { accessCount: 1 },
    accessedAt: new Date()
  });

  res.status(200).json({
    status: 'success',
    data: {
      sharing
    }
  });
};

export const updateSharingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { status } = req.body;

  const sharing = await Sharing.findById(id);
  if (!sharing) {
    return next(new AppError('共享记录不存在', 404));
  }

  if (req.user && sharing.createdBy.toString() !== req.user._id.toString()) {
    return next(new AppError('无权修改此共享记录', 403));
  }

  sharing.status = status;
  await sharing.save();

  res.status(200).json({
    status: 'success',
    data: {
      sharing
    }
  });
};

export const deleteSharing = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const sharing = await Sharing.findById(id);
  if (!sharing) {
    return next(new AppError('共享记录不存在', 404));
  }

  if (req.user && sharing.createdBy.toString() !== req.user._id.toString()) {
    return next(new AppError('无权删除此共享记录', 403));
  }

  await Sharing.findByIdAndUpdate(id, { status: 'revoked' });

  res.status(204).json({
    status: 'success',
    data: null
  });
};

export const getMuseums = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { page = 1, limit = 50, keyword } = req.query;

  const filter: any = { isActive: true };
  if (keyword) {
    filter.$text = { $search: keyword as string };
  }

  const museums = await Museum.find(filter)
    .sort({ name: 1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));

  const total = await Museum.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: museums.length,
    total,
    data: {
      museums
    }
  });
};

export const createMuseum = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { name, code, address, contact, phone, email, description } = req.body;

  const existing = await Museum.findOne({ code: code.toUpperCase() });
  if (existing) {
    return next(new AppError('场馆编码已存在', 400));
  }

  const museum = await Museum.create({
    name,
    code: code.toUpperCase(),
    address,
    contact,
    phone,
    email,
    description
  });

  res.status(201).json({
    status: 'success',
    data: {
      museum
    }
  });
};
