import express from 'express';
import {
  login,
  register,
  getCurrentUser,
  getAllUsers,
  updateUser,
  deleteUser,
  updateProfile,
  changePassword
} from './auth.controller';
import { protect, restrictTo } from './auth.middleware';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);

router.use(protect);

router.get('/me', getCurrentUser);
router.patch('/profile', updateProfile);
router.patch('/change-password', changePassword);

router.use(restrictTo('admin'));

router.get('/', getAllUsers);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
