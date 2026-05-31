import express from 'express';
import { searchController } from '../controllers/search.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/images', authenticate, searchController.searchImages);
router.get('/specimens', authenticate, searchController.searchSpecimens);
router.get('/suggestions', authenticate, searchController.getSearchSuggestions);
router.get('/tag-cloud', authenticate, searchController.getTagCloud);

export default router;
