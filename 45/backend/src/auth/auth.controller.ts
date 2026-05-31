import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { IUser } from './user.model';
import { AuthRequest } from './auth.middleware';
import { AppError } from '../middleware/error.middleware';

const signToken = (id: string | mongoose.Types.ObjectId) => {
  return jwt.sign({ id: id.toString() }, process.env.JWT_SECRET || 'fossil3d_secret_key_2024', {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  } as jwt.SignOptions);
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new AppError('请输入用户名和密码', 400));
  }

  const user = await User.findOne({ username }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('用户名或密码错误', 401));
  }

  if (!user.isActive) {
    return next(new AppError('账号已被禁用', 401));
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id);
  const userWithoutPassword = user.toObject();
  delete (userWithoutPassword as any).password;

  res.status(200).json({
    status: 'success',
    token,
    data: {
      user: userWithoutPassword
    }
  });
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { username, email, password, realName, role, phone, department } = req.body;

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existingUser) {
    return next(new AppError('用户名或邮箱已存在', 400));
  }

  const newUser = await User.create({
    username,
    email,
    password,
    realName,
    role: role || 'viewer',
    phone,
    department
  });

  const token = signToken(newUser._id);
  const userWithoutPassword = newUser.toObject();
  delete (userWithoutPassword as any).password;

  res.status(201).json({
    status: 'success',
    token,
    data: {
      user: userWithoutPassword
    }
  });
};

export const getCurrentUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
};

export const getAllUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const users = await User.find();
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users
    }
  });
};

export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { role, isActive, realName, phone, department } = req.body;

  const user = await User.findByIdAndUpdate(
    id,
    { role, isActive, realName, phone, department },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('用户不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const user = await User.findByIdAndDelete(id);
  if (!user) {
    return next(new AppError('用户不存在', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { realName, email, phone, department } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { realName, email, phone, department },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('用户不存在', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
};

export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { oldPassword, newPassword } = req.body;

  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(oldPassword))) {
    return next(new AppError('原密码错误', 401));
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    status: 'success',
    message: '密码修改成功'
  });
};
