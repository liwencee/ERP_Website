import { Router } from 'express';
import * as pages from '../controllers/public/pages.controller';

const router = Router();

router.get('/', pages.home);
router.get('/about', pages.about);
router.get('/services', pages.services);
router.get('/team', pages.team);
router.get('/compliance', pages.compliance);
router.get('/contact', pages.contactGet);
router.post('/contact', pages.contactPost);

export default router;
