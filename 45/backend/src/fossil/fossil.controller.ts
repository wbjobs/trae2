import { Request, Response, NextFunction } from 'express';
import Fossil, { IFossil } from './fossil.model';
import { AuthRequest } from '../auth/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const buildSearchFilter = (keyword: string) => {
  const regex = { $regex: keyword, $options: 'i' };
  return {
    $or: [
      { name: regex },
      { scientificName: regex },
      { specimenNo: regex },
      { description: regex },
      { tags: regex },
      { geologicalPeriod: regex },
      { discoveryLocation: regex },
      { features: regex }
    ]
  };
};

export const createFossil = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const fossilData = {
    ...req.body,
    createdBy: req.user._id,
    updatedBy: req.user._id
  };

  const fossil = await Fossil.create(fossilData);

  res.status(201).json({
    status: 'success',
    data: {
      fossil
    }
  });
};

export const getAllFossils = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const {
    page = 1,
    limit = 20,
    search,
    category,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    museumId,
    isShared
  } = req.query;

  const filter: any = {};

  if (search) {
    const searchStr = search as string;
    if (searchStr.length >= 2) {
      Object.assign(filter, buildSearchFilter(searchStr));
    }
  }

  if (category && category !== 'all') {
    filter.category = category;
  }

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (museumId) {
    filter.museumId = museumId;
  }

  if (isShared !== undefined) {
    filter.isShared = isShared === 'true';
  }

  const sort: any = {};
  if (sortBy === 'relevance' && search) {
    sort.score = { $meta: 'textScore' };
  } else {
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
  }

  const selectFields = '-searchVector';

  const fossils = await Fossil.find(filter)
    .select(selectFields)
    .sort(sort)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('createdBy', 'realName username')
    .populate('updatedBy', 'realName username')
    .populate('museumId', 'name code');

  const total = await Fossil.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: fossils.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      fossils
    }
  });
};

export const searchSuggestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { keyword } = req.query;

  if (!keyword || (keyword as string).length < 2) {
    return res.status(200).json({
      status: 'success',
      data: {
        suggestions: []
      }
    });
  }

  const filter = buildSearchFilter(keyword as string);

  const suggestions = await Fossil.find(filter)
    .limit(10)
    .select('name specimenNo scientificName category')
    .lean();

  const processed = suggestions.map((item: any) => ({
    id: item._id,
    text: `${item.specimenNo} - ${item.name}`,
    name: item.name,
    specimenNo: item.specimenNo,
    scientificName: item.scientificName,
    category: item.category,
    type: 'fossil'
  }));

  res.status(200).json({
    status: 'success',
    data: {
      suggestions: processed
    }
  });
};

export const advancedSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const {
    page = 1,
    limit = 20,
    keyword,
    category,
    status,
    geologicalPeriod,
    discoveryLocation,
    dateFrom,
    dateTo,
    isShared,
    tags,
    sortBy = 'relevance',
    sortOrder = 'desc'
  } = req.body;

  const filter: any = {};

  if (keyword && keyword.length >= 2) {
    Object.assign(filter, buildSearchFilter(keyword));
  }

  if (category && category !== 'all') {
    filter.category = category;
  }

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (geologicalPeriod) {
    filter.geologicalPeriod = { $regex: geologicalPeriod, $options: 'i' };
  }

  if (discoveryLocation) {
    filter.discoveryLocation = { $regex: discoveryLocation, $options: 'i' };
  }

  if (dateFrom || dateTo) {
    filter.discoveryDate = {};
    if (dateFrom) filter.discoveryDate.$gte = new Date(dateFrom);
    if (dateTo) filter.discoveryDate.$lte = new Date(dateTo);
  }

  if (isShared !== undefined) {
    filter.isShared = isShared;
  }

  if (tags && tags.length) {
    filter.tags = { $all: tags };
  }

  const sort: any = {};
  if (sortBy === 'relevance' && keyword) {
    sort.score = { $meta: 'textScore' };
  } else {
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
  }

  const fossils = await Fossil.find(filter)
    .sort(sort)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate('createdBy', 'realName username')
    .populate('museumId', 'name code');

  const total = await Fossil.countDocuments(filter);

  const aggregations = await Fossil.aggregate([
    { $match: filter },
    {
      $facet: {
        byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPeriod: [{ $group: { _id: '$geologicalPeriod', count: { $sum: 1 } } }]
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    results: fossils.length,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    data: {
      fossils,
      aggregations: aggregations[0]
    }
  });
};

export const getFossil = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const fossil = await Fossil.findById(id)
    .populate('createdBy', 'realName username')
    .populate('updatedBy', 'realName username');

  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      fossil
    }
  });
};

export const getFossilBySpecimenNo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { specimenNo } = req.params;

  const fossil = await Fossil.findOne({ specimenNo })
    .populate('createdBy', 'realName username')
    .populate('updatedBy', 'realName username');

  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      fossil
    }
  });
};

export const updateFossil = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const updateData = {
    ...req.body,
    updatedBy: req.user._id
  };

  const fossil = await Fossil.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true
  }).populate('createdBy', 'realName username')
    .populate('updatedBy', 'realName username');

  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      fossil
    }
  });
};

export const deleteFossil = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const fossil = await Fossil.findByIdAndDelete(id);
  if (!fossil) {
    return next(new AppError('标本不存在', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
};

export const getFossilStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const stats = await Fossil.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byCategory: {
          $push: {
            k: '$category',
            v: { $sum: 1 }
          }
        },
        byStatus: {
          $push: {
            k: '$status',
            v: { $sum: 1 }
          }
        }
      }
    }
  ]);

  const categoryStats = await Fossil.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);

  const statusStats = await Fossil.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const recentAdded = await Fossil.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name specimenNo category createdAt');

  res.status(200).json({
    status: 'success',
    data: {
      total: stats[0]?.total || 0,
      categoryStats,
      statusStats,
      recentAdded
    }
  });
};
